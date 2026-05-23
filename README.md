# fetch-dockerhub-tags

Fetch Docker Hub tags for a specific image.

## Why?

Ever build some custom image that depends on a base image that is frequently updated? This action can help you automatically fetch the latest tag for that base image, ensuring your builds are always up-to-date.

## Inputs

| Input       | Required | Default | Example         | Description                                                  |
| ----------- | -------- | ------- | --------------- | ------------------------------------------------------------ |
| `repo`      | Yes      |         | `library/nginx` | Docker Hub repository to fetch tags from.                    |
| `filter`    | No       |         | `main`          | Optional RegEx filter to apply when fetching tags.           |
| `max_pages` | No       | `1`     | `-1`            | Maximum number of Docker Hub tag pages to fetch; `-1` = all. |
| `token`     | No       |         |                 | Optional token to authenticate with Docker Hub.              |

## Outputs

- `name`: Resolved Docker image tag for the selected repository.
- `full_size`: Size of the Docker image.
- `architecture`: Architecture(s) of the Docker image (comma-separated if multiple).
- `last_updated`: Timestamp of when the image was last updated.
- `digest`: Digest of the Docker image.
- `matched-groups`: JSON array of RegEx capture groups from the selected tag.
- `results`: JSON array of all fetched tags with their details.

## Examples

Basic usage:

```yaml
- name: 🔎 Fetch Docker Hub Tags
  uses: Toanzz/fetch-dockerhub-tags@v1
  with:
    repo: library/nginx
```

With filter and token:

```yaml
- name: 🔎 Fetch Docker Hub Tags
  uses: Toanzz/fetch-dockerhub-tags@v1
  with:
    repo: library/nginx
    filter: ^\d+\.\d+\.debian13$ # RegEx to match tags like "1.21.6-debian13"
    max_pages: -1 # Fetch all pages when the match may not be on the first page
    token: ${{ secrets.DOCKERHUB_TOKEN }}
```

Example output:

```yaml
name: 1.21.6-debian13
full_size: 133MB
architecture: amd64, arm64
last_updated: 2024-06-01T12:00:00Z
digest: sha256:abc123def456...
matched-groups: '["1.21.6"]'
results: '[{"name":"1.21.6-debian13","full_size":133000000,"architecture":["amd64","arm64"],"last_updated":"2024-06-01T12:00:00Z","digest":"sha256:abc123def456...","matched_groups":["1.21.6"]}, ...]'
```

## Acknowledgments

This action uses the Docker Hub API to fetch tags. For more details on the API, please refer to the official documentation:

🌐 https://docs.docker.com/reference/api/hub/latest/

## License

This project is licensed under the [Apache License 2.0](LICENSE).
