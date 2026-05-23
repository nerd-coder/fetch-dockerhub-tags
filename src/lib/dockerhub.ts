import { logInfo } from './helpers.ts'

const DOCKER_HUB_API_URL = 'https://hub.docker.com/v2'
const PAGE_SIZE = 100

type DockerHubImage = {
  architecture?: unknown
  digest?: unknown
  os?: unknown
  variant?: unknown
}

type DockerHubTag = {
  name?: unknown
  digest?: unknown
  full_size?: unknown
  images?: unknown
  last_updated?: unknown
  tag_last_pushed?: unknown
}

type DockerHubTagsResponse = {
  next?: unknown
  results?: unknown
}

export type DockerHubRepository = {
  namespace: string
  repository: string
}

export type TagResult = {
  name: string
  full_size: number | null
  architecture: string[]
  last_updated: string
  digest: string
  matched_groups: (string | null)[]
}

/** Parses a Docker Hub repository input into namespace and repository parts.
 *
 * @param repo - A Docker Hub repo name, URL, or official image name.
 * @returns The normalized Docker Hub namespace and repository.
 */
export function parseRepo(repo: string): DockerHubRepository {
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

/** Parses and validates the maximum number of Docker Hub pages to fetch.
 *
 * @param maxPages - A string containing a positive integer, or -1 for all pages.
 * @returns The validated page count.
 */
export function parseMaxPages(maxPages: string): number {
  const normalizedMaxPages = maxPages.trim() || '1'

  if (!/^-?\d+$/.test(normalizedMaxPages)) {
    throw new Error(
      'max_pages must be a positive integer, or -1 to fetch all pages.'
    )
  }

  const parsedMaxPages = Number(normalizedMaxPages)

  if (parsedMaxPages !== -1 && parsedMaxPages < 1) {
    throw new Error(
      'max_pages must be a positive integer, or -1 to fetch all pages.'
    )
  }

  return parsedMaxPages
}

/** Builds a Docker Hub Authorization header value from an optional token.
 *
 * @param token - A raw Docker Hub bearer token or a preformatted bearer value.
 * @returns The Authorization header value, or undefined when no token is provided.
 */
function buildAuthHeader(token: string): string | undefined {
  if (!token) {
    return undefined
  }

  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`
}

/** Reads image metadata from a Docker Hub tag payload.
 *
 * @param tag - The raw Docker Hub tag object.
 * @returns An array of raw image entries, or an empty array when absent.
 */
function getTagImages(tag: DockerHubTag): DockerHubImage[] {
  return Array.isArray(tag.images) ? tag.images : []
}

/** Converts a Docker Hub tag payload into the action's stable output shape.
 *
 * @param tag - The raw Docker Hub tag object.
 * @returns A normalized tag result, or null when the payload has no tag name.
 */
function normalizeTag(tag: DockerHubTag): TagResult | null {
  if (typeof tag.name !== 'string' || !tag.name) {
    return null
  }

  const images = getTagImages(tag)
  const platformImages = images.filter(
    (image) => image.architecture !== 'unknown' && image.os !== 'unknown'
  )
  const architecture = [
    ...new Set(
      platformImages
        .map((image) => {
          if (typeof image.architecture !== 'string' || !image.architecture) {
            return null
          }

          return typeof image.variant === 'string' && image.variant
            ? `${image.architecture}/${image.variant}`
            : image.architecture
        })
        .filter(
          (value): value is string => typeof value === 'string' && value !== ''
        )
    ),
  ]

  const digest =
    (typeof tag.digest === 'string' && tag.digest) ||
    platformImages.find((image) => typeof image.digest === 'string')?.digest ||
    images.find((image) => typeof image.digest === 'string')?.digest ||
    ''

  return {
    name: tag.name,
    full_size: typeof tag.full_size === 'number' ? tag.full_size : null,
    architecture,
    last_updated:
      (typeof tag.last_updated === 'string' && tag.last_updated) ||
      (typeof tag.tag_last_pushed === 'string' && tag.tag_last_pushed) ||
      '',
    digest: typeof digest === 'string' ? digest : '',
    matched_groups: [],
  }
}

/** Extracts positional capture groups from a matched tag name.
 *
 * @param match - The regular expression match for a tag name.
 * @returns Ordered capture group values, using null for unmatched optional groups.
 */
function getMatchedGroups(match: RegExpExecArray): (string | null)[] {
  return match.slice(1).map((group) => group ?? null)
}

/** Adds regular expression capture groups to a tag result.
 *
 * @param tag - The tag result that matched the filter.
 * @param match - The regular expression match for the tag name.
 * @returns A tag result with matched capture groups attached.
 */
function withMatchedGroups(tag: TagResult, match: RegExpExecArray): TagResult {
  return {
    ...tag,
    matched_groups: getMatchedGroups(match),
  }
}

/** Compares two tag results by last update time, newest first.
 *
 * @param left - The left tag result.
 * @param right - The right tag result.
 * @returns A sort comparison number.
 */
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

/** Fetches a Docker Hub API JSON response with optional bearer authentication.
 *
 * @param url - The Docker Hub API URL to fetch.
 * @param token - The optional Docker Hub bearer token.
 * @returns The parsed Docker Hub tags response.
 */
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

/** Fetches Docker Hub tags up to the requested page limit.
 *
 * @param dockerRepository - The normalized Docker Hub namespace and repository.
 * @param token - The optional Docker Hub bearer token.
 * @param maxPages - A positive page count, or -1 for all pages.
 * @returns Normalized tag results from the fetched pages.
 */
export async function fetchTags(
  dockerRepository: DockerHubRepository,
  token: string,
  maxPages: number
): Promise<TagResult[]> {
  const { namespace, repository } = dockerRepository
  const initialUrl = new URL(
    `${DOCKER_HUB_API_URL}/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(repository)}/tags`
  )
  initialUrl.searchParams.set('page_size', String(PAGE_SIZE))

  const tags: TagResult[] = []
  let pagesFetched = 0
  let nextUrl: string | null = initialUrl.toString()

  while (nextUrl && (maxPages === -1 || pagesFetched < maxPages)) {
    logInfo(`Fetching Docker Hub tags from ${nextUrl}`)

    const response = await fetchJson(nextUrl, token)
    pagesFetched += 1
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

/** Filters and sorts normalized tags for action output selection.
 *
 * @param tags - The fetched Docker Hub tags.
 * @param filter - An optional regular expression string for tag names.
 * @returns Matching tags sorted by update time descending.
 */
export function filterTags(tags: TagResult[], filter: string): TagResult[] {
  const filterRegex = filter ? new RegExp(filter) : null

  const matchingTags = filterRegex
    ? tags.flatMap((tag) => {
        const match = filterRegex.exec(tag.name)

        return match ? [withMatchedGroups(tag, match)] : []
      })
    : tags

  return matchingTags.sort(compareTagsByLastUpdatedDesc)
}
