FROM rust:1.85 AS chef
WORKDIR /app

RUN cargo install cargo-chef

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

COPY . .

RUN cargo build --release

FROM debian:buster-slim

WORKDIR /app

COPY --from=builder /app/target/release/human-friendly-ids-demo .
COPY /static /app/static

EXPOSE 8000
ENV EXPECTED_USERNAME=your_username
ENV EXPECTED_PASSWORD=your_password

CMD ["./human-friendly-ids-demo"]
