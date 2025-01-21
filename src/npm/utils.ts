import type { Packument } from '@npm/types'

import { maxSatisfying } from 'semver'

const caches: Record<string, Promise<Packument | null>> = {}

export const fetchDepPackument = (name: string) => {
  if (caches[name] != null) {
    return caches[name]
  }

  const url = `https://registry.npmjs.org/${name}`
  const fetchPromise = fetch(url)
    .then((resp) => resp.json())
    .then((packument: Packument) => packument)
    .catch(() => null)
  caches[name] = fetchPromise
  return fetchPromise
}

export const fetchLatestVersion = (name: string) => {
  return fetchDepPackument(name).then<string | null>((packument) => {
    if (packument.error) {
      return null
    }
    return packument?.['dist-tags'].latest ?? null
  })
}

export const fetchSatisfiesVersion = (
  name: string,
  version?: string | null,
) => {
  if (version == null) {
    return null
  }

  return fetchDepPackument(name).then<string | null>((packument) => {
    const versions = packument?.versions
    if (versions == null) {
      return null
    }
    const satisfiesVersion = maxSatisfying(Object.keys(versions), version)
    if (satisfiesVersion == null) {
      return null
    }
    return satisfiesVersion
  })
}
