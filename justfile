repo := 'ghcr.io/josiahbull/human-friendly-ids-demo'

# General SQLX files
codegen:
    @export DATABASE_URL=sqlite://$PWD/test.db
    @echo y | @sqlx database drop
    @sqlx database create
    @sqlx migrate run --source ./crates/database/migrations
    @sqlx prepare --workspace

# Run formatting
format:
    @cargo +nightly fmt
    @cargo autoinherit

# Run tests and check for unused dependencies
test:
    @cargo test
    @cargo +nightly udeps

# Build the project & Create dockerfiles for the desired triple
docker-build triple=(arch() + "-unknown-linux-musl"):
    #!/bin/bash

    set -o errexit -o nounset -o pipefail

    # Initalise docker buildx
    docker buildx create --use

    # Create the docker project
    docker buildx build \
        --platform $platform \
        --file ./Dockerfile \
        --tag "{{repo}}:{{triple}}-$(git rev-parse --short HEAD)" \
        --tag "{{repo}}:{{triple}}-latest" \
        --load \
        .

docker-push triple=(arch() + "-unknown-linux-musl"):
    #!/bin/bash

    set -o errexit -o nounset -o pipefail

    docker push {{repo}}:{{triple}}-$(git rev-parse --short HEAD)
    docker push {{repo}}:{{triple}}-latest

docker-manifest triples=(arch() + "-unknown-linux-musl"):
    #!/bin/bash

    set -o errexit -o nounset -o pipefail

    # Pull the images
    echo "Pulling images"
    for triple in {{triples}}; do
        echo "Pulling {{repo}}:$triple-$(git rev-parse --short HEAD)"
        docker pull {{repo}}:$triple-$(git rev-parse --short HEAD);
        docker pull {{repo}}:$triple-latest;
    done

    # Create the manifest for sha
    echo "Creating manifest for {{repo}}:$(git rev-parse --short HEAD)"
    docker manifest create {{repo}}:$(git rev-parse --short HEAD) \
        $(for triple in {{triples}}; do echo -n "--amend {{repo}}:$triple-$(git rev-parse --short HEAD) "; done)

    # Create the manifest for latest
    echo "Creating manifest for latest"
    docker manifest create {{repo}}:latest \
        $(for triple in {{triples}}; do echo -n "--amend {{repo}}:$triple-latest "; done)

docker-manifest-push:
    #!/bin/bash

    set -o errexit -o nounset -o pipefail

    docker manifest push "{{repo}}:$(git rev-parse --short HEAD)"
    docker manifest push "{{repo}}:latest"

default:
    @just --list
