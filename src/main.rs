use std::sync::OnceLock;

use human_friendly_ids::UploadId;
use rocket::fs::NamedFile;
use rocket::response::Redirect;
use rocket::tokio::sync::RwLock;
use rocket::{Request, State, get, http::Status, launch, post, routes, serde::json::Json};
use rocket::{catch, catchers};
use rocket_basicauth::BasicAuth;
use rustrict::CensorStr as _;
use serde::{Deserialize, Serialize};

// Data structures
#[derive(Debug, Deserialize, Serialize, Clone)]
struct SubmissionRequest {
    id: String,
    username: String,
}

#[derive(Debug, Serialize, Clone)]
struct SubmissionStats {
    original_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    corrected_id: Option<String>,
    was_valid: bool,
    username: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

// Application state
struct AppState {
    submissions: RwLock<Vec<SubmissionStats>>,
}

// ID validation and correction logic
fn process_id(id: String) -> Option<String> {
    UploadId::try_from(id.to_string())
        .map(|id| id.to_string())
        .ok()
}

// Routes
#[post("/submit", data = "<submission>")]
async fn submit(
    submission: Json<SubmissionRequest>,
    state: &State<AppState>,
) -> Result<Json<SubmissionStats>, Status> {
    // If more than 20 chars, return 400
    if submission.id.len() > 20 {
        return Err(Status::BadRequest);
    }

    if submission.username.len() > 30 {
        return Err(Status::BadRequest);
    }

    let corrected_id = process_id(submission.id.clone());

    let username = if submission.username.is_inappropriate() {
        "naughty rustacean".to_string()
    } else {
        submission.username.clone()
    };

    // See if the original_id was in ANY of the media files
    // If it was, then we can assume that the user has the correct ID
    static IDS_CACHE: OnceLock<Vec<String>> = OnceLock::new();
    let ids = IDS_CACHE.get_or_init(|| {
        let media_dir = std::fs::read_dir("./static/media").unwrap();
        let ids: Vec<_> = media_dir
            .filter_map(|entry| entry.ok())
            .map(|entry| {
                let name = entry.file_name().into_string().unwrap();
                let txt_name = format!(
                    "{}.txt",
                    name.trim_end_matches(".png").trim_end_matches(".mp3")
                );
                let answer = std::fs::read_to_string(format!("./static/media/{}", txt_name))
                    .unwrap_or_default();

                // get second line.
                let uncorrected_answer = answer.lines().nth(1).unwrap_or_default();

                uncorrected_answer.to_string()
            })
            .collect();
        ids
    });

    let was_valid = ids.contains(&submission.id);

    let stats = SubmissionStats {
        original_id: submission.id.clone(),
        corrected_id: corrected_id.clone(),
        username: username.clone(),
        was_valid,
        timestamp: chrono::Utc::now(),
    };

    state.submissions.write().await.push(stats.clone());

    Ok(Json(stats))
}

#[get("/stats?<after>")]
async fn stats(
    state: &State<AppState>,
    after: Option<String>,
) -> Result<Json<Vec<SubmissionStats>>, Status> {
    let after = after.as_deref().map(chrono::DateTime::parse_from_rfc3339);
    let after = match after {
        Some(Ok(dt)) => Some(dt),
        Some(Err(_)) => return Err(Status::BadRequest),
        None => None,
    };

    let submissions = state.submissions.read().await;
    let filtered_submissions: Vec<SubmissionStats> = match after {
        Some(after) => submissions
            .iter()
            .filter(|s| s.timestamp > after)
            .cloned()
            .collect(),
        None => submissions.clone(),
    };
    Ok(Json(filtered_submissions))
}

#[post("/reset-stats")]
async fn reset_stats(state: &State<AppState>, auth: BasicAuth) -> Result<&'static str, Status> {
    let expected_username = std::env::var("ADMIN_USERNAME").unwrap();
    let expected_password = std::env::var("ADMIN_PASSWORD").unwrap();

    if auth.username != expected_username || auth.password != expected_password {
        return Err(Status::Unauthorized);
    }

    let mut submissions = state.submissions.write().await;
    submissions.clear();
    Ok("Statistics reset")
}

#[derive(Debug, Serialize)]
struct MediaEntry {
    /// The name of the media file, to be appended to /media/{name}
    name: String,
    /// The MIME type of the media file
    /// Either:
    /// - image/png
    /// - audio/mpeg
    r#type: String,
    /// The uncorrected and corrected answer for the media file
    uncorrected_answer: String,
    /// What the string should be after correction.
    corrected_answer: String,
}

#[get("/medias")]
async fn medias(auth: BasicAuth) -> Result<Json<Vec<MediaEntry>>, Status> {
    let expected_username = std::env::var("ADMIN_USERNAME").unwrap();
    let expected_password = std::env::var("ADMIN_PASSWORD").unwrap();

    if auth.username != expected_username || auth.password != expected_password {
        return Err(Status::Unauthorized);
    }

    // Read all .png and .mp3 files in static/media
    let mut entries = Vec::new();
    let media_dir = std::fs::read_dir("./static/media").unwrap();
    let mut media_files: Vec<_> = media_dir
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name().into_string().unwrap();
            name.ends_with(".png") || name.ends_with(".mp3")
        })
        .collect();

    // Sort the media files by their names
    media_files.sort_by_key(|entry| entry.file_name());

    for entry in media_files {
        let name = entry.file_name().into_string().unwrap();
        let txt_name = format!(
            "{}.txt",
            name.trim_end_matches(".png").trim_end_matches(".mp3")
        );
        let answer =
            std::fs::read_to_string(format!("./static/media/{}", txt_name)).unwrap_or_default();

        // Expect answer to have two lines in the file. The first line is the uncorrected answer.
        // The second line is the corrected answer.
        let uncorrected_answer = answer.lines().next().unwrap_or_default();
        let corrected_answer = answer.lines().nth(1).unwrap_or_default();

        let r#type = if name.ends_with(".png") {
            "image/png"
        } else {
            "audio/mpeg"
        };

        entries.push(MediaEntry {
            name,
            uncorrected_answer: uncorrected_answer.to_string(),
            corrected_answer: corrected_answer.to_string(),
            r#type: r#type.to_string(),
        });
    }

    Ok(Json(entries))
}

#[get("/healthcheck")]
fn healthcheck() -> &'static str {
    "OK"
}

#[get("/robots.txt")]
fn robots() -> &'static str {
    "User-agent: *\nDisallow: /"
}

#[catch(401)]
async fn unauthorized(_req: &Request<'_>) -> NamedFile {
    NamedFile::open("./static/401.html").await.unwrap()
}

#[catch(404)]
async fn not_found(_req: &Request<'_>) -> Redirect {
    Redirect::to("/")
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(AppState {
            submissions: RwLock::new(Vec::new()),
        })
        .mount(
            "/",
            routes![submit, stats, reset_stats, medias, healthcheck, robots],
        )
        .mount("/", rocket::fs::FileServer::from("static"))
        .register("/", catchers![not_found, unauthorized])
}
