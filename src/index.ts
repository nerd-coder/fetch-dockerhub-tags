import * as core from '@actions/core'
import {
  fetchTags,
  filterTags,
  parseMaxPages,
  parseRepo,
  type TagResult,
} from './lib/dockerhub.ts'
import { logError, logStep, logSuccess, logWarn } from './lib/helpers.ts'

type ActionInputs = {
  repo: string
  filter: string
  maxPages: number
  token: string
}

/** Reads and validates GitHub Action inputs.
 *
 * @returns The normalized action inputs.
 */
function getActionInputs(): ActionInputs {
  return {
    repo: core.getInput('repo', { required: true }),
    filter: core.getInput('filter'),
    maxPages: parseMaxPages(core.getInput('max_pages') || '1'),
    token: core.getInput('token'),
  }
}

/** Selects the first matching Docker Hub tag or fails with a clear message.
 *
 * @param tags - Matching Docker Hub tag results.
 * @param namespace - The Docker Hub namespace used in the request.
 * @param repository - The Docker Hub repository used in the request.
 * @param filter - The optional tag filter.
 * @param fetchedTagCount - The number of fetched Docker Hub tag records.
 * @returns The selected newest matching tag.
 */
function selectTag(
  tags: TagResult[],
  namespace: string,
  repository: string,
  filter: string,
  fetchedTagCount: number
): TagResult {
  const selectedTag = tags[0]

  if (selectedTag) {
    return selectedTag
  }

  logWarn(
    `No image matched after fetching ${fetchedTagCount} image tag(s) from ${namespace}/${repository}.`
  )

  throw new Error(
    filter
      ? `No tags found for ${namespace}/${repository} matching filter "${filter}".`
      : `No tags found for ${namespace}/${repository}.`
  )
}

/** Writes GitHub Action outputs for the selected tag and full result set.
 *
 * @param selectedTag - The newest matching Docker Hub tag.
 * @param matchingTags - All matching Docker Hub tags.
 * @returns Nothing.
 */
function setActionOutputs(
  selectedTag: TagResult,
  matchingTags: TagResult[]
): void {
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

/** Runs the GitHub Action workflow from input parsing through output writing.
 *
 * @returns Nothing.
 */
async function main(): Promise<void> {
  const inputs = getActionInputs()
  const dockerRepository = parseRepo(inputs.repo)
  const { namespace, repository } = dockerRepository

  logStep(
    `Fetching Docker Hub tags for ${namespace}/${repository} (${inputs.maxPages === -1 ? 'all pages' : `${inputs.maxPages} page(s)`})`
  )

  const tags = await fetchTags(dockerRepository, inputs.token, inputs.maxPages)
  const matchingTags = filterTags(tags, inputs.filter)
  const selectedTag = selectTag(
    matchingTags,
    namespace,
    repository,
    inputs.filter,
    tags.length
  )

  logSuccess(`Selected Docker Hub tag ${selectedTag.name}`)
  setActionOutputs(selectedTag, matchingTags)
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)

  logError(message)
  core.setFailed(message)
}
