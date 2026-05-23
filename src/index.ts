import * as core from '@actions/core'

const DOCKER_HUB_API_URL = 'https://hub.docker.com/v2'
const PAGE_SIZE = 100

type DockerHubImage = {
  architecture?: unknown
  digest?: unknown
}

type DockerHubTag = {
  name?: unknown
  full_size?: unknown
  images?: unknown
  last_updated?: unknown
  tag_last_pushed?: unknown
}

type DockerHubTagsResponse = {
  next?: unknown
  results?: unknown
}

type TagResult = {
  name: string
  full_size: number | null
  architecture: string[]
  last_updated: string
  digest: string
}

function parseRepo(repo: string): { namespace: string; repository: string } {
  const normalizedRepo = repo
    .trim()
    .replace(/^https?:\/\/(?:www\.)?hub\.docker\.com\/r\//, '')
    .replace(/^docker\.io\//, '')
    .replace(/^registry-1\.docker\.io\//, '')

  const parts = normalizedRepo.split('/').filter(Boolean)

  if (parts.length === 1) {
    return { namespace: 'library', repository: parts[0] }
  }

  if (parts.length === 2) {
    return { namespace: parts[0], repository: parts[1] }
  }

  throw new Error(
    `Invalid Docker Hub repository "${repo}". Use "namespace/repository" or an official image name like "nginx".`
  )
}

function buildAuthHeader(token: string): string | undefined {
  if (!token) {
    return undefined
  }

  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`
}

function getTagImages(tag: DockerHubTag): DockerHubImage[] {
  return Array.isArray(tag.images) ? tag.images : []
}

function normalizeTag(tag: DockerHubTag): TagResult | null {
  if (typeof tag.name !== 'string' || !tag.name) {
    return null
  }

  const images = getTagImages(tag)
  const architecture = [
    ...new Set(
      images
        .map((image) => image.architecture)
        .filter(
          (value): value is string => typeof value === 'string' && value !== ''
        )
    ),
  ]

  const digest =
    images.find((image) => typeof image.digest === 'string')?.digest ?? ''

  return {
    name: tag.name,
    full_size: typeof tag.full_size === 'number' ? tag.full_size : null,
    architecture,
    last_updated:
      (typeof tag.last_updated === 'string' && tag.last_updated) ||
      (typeof tag.tag_last_pushed === 'string' && tag.tag_last_pushed) ||
      '',
    digest: typeof digest === 'string' ? digest : '',
  }
}

function compareTagsByLastUpdatedDesc(
  left: TagResult,
  right: TagResult
): number {
  const rightTime = Date.parse(right.last_updated)
  const leftTime = Date.parse(left.last_updated)

  if (Number.isNaN(rightTime) && Number.isNaN(leftTime)) {
    return left.name.localeCompare(right.name)
  }

  if (Number.isNaN(rightTime)) {
    return -1
  }

  if (Number.isNaN(leftTime)) {
    return 1
  }

  return rightTime - leftTime || left.name.localeCompare(right.name)
}

async function fetchJson(
  url: string,
  token: string
): Promise<DockerHubTagsResponse> {
  const authHeader = buildAuthHeader(token)
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const details = body ? `: ${body}` : ''

    throw new Error(
      `Docker Hub request failed with ${response.status} ${response.statusText}${details}`
    )
  }

  const json: unknown = await response.json()

  if (!json || typeof json !== 'object') {
    throw new Error('Docker Hub returned an invalid JSON response.')
  }

  return json as DockerHubTagsResponse
}

async function fetchTags(
  namespace: string,
  repository: string,
  token: string
): Promise<TagResult[]> {
  const initialUrl = new URL(
    `${DOCKER_HUB_API_URL}/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(repository)}/tags`
  )
  initialUrl.searchParams.set('page_size', String(PAGE_SIZE))

  const tags: TagResult[] = []
  let nextUrl: string | null = initialUrl.toString()

  while (nextUrl) {
    core.debug(`Fetching Docker Hub tags from ${nextUrl}`)

    const response = await fetchJson(nextUrl, token)
    const results = Array.isArray(response.results) ? response.results : []

    for (const rawTag of results) {
      if (rawTag && typeof rawTag === 'object') {
        const tag = normalizeTag(rawTag as DockerHubTag)

        if (tag) {
          tags.push(tag)
        }
      }
    }

    nextUrl =
      typeof response.next === 'string' && response.next ? response.next : null
  }

  return tags
}

async function main(): Promise<void> {
  const repo = core.getInput('repo', { required: true })
  const filter = core.getInput('filter')
  const token = core.getInput('token')
  const { namespace, repository } = parseRepo(repo)
  const filterRegex = filter ? new RegExp(filter) : null

  core.info(`Fetching Docker Hub tags for ${namespace}/${repository}`)

  const tags = await fetchTags(namespace, repository, token)
  const matchingTags = (
    filterRegex ? tags.filter((tag) => filterRegex.test(tag.name)) : tags
  ).sort(compareTagsByLastUpdatedDesc)

  if (matchingTags.length === 0) {
    throw new Error(
      filter
        ? `No tags found for ${namespace}/${repository} matching filter "${filter}".`
        : `No tags found for ${namespace}/${repository}.`
    )
  }

  const selectedTag = matchingTags[0]

  core.info(`Selected Docker Hub tag ${selectedTag.name}`)
  core.setOutput('name', selectedTag.name)
  core.setOutput(
    'full_size',
    selectedTag.full_size === null ? '' : String(selectedTag.full_size)
  )
  core.setOutput('architecture', selectedTag.architecture.join(', '))
  core.setOutput('last_updated', selectedTag.last_updated)
  core.setOutput('digest', selectedTag.digest)
  core.setOutput('results', JSON.stringify(matchingTags))
}

try {
  await main()
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error))
}
