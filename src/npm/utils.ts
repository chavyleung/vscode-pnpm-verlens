import type { Packument } from '@npm/types'

import { maxSatisfying } from 'semver'
import { workspace } from 'vscode'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const caches: Record<string, Promise<Packument | null>> = {}

let _registry = ''
const getRegistry = () => {
  if (_registry) {
    return _registry
  }

  const config = workspace.getConfiguration('vscode-pnpm-verlens')
  const reg = config.get<string>('registry', DEFAULT_REGISTRY)
  _registry = reg ? reg : DEFAULT_REGISTRY
  return _registry
}

export const fetchDepPackument = (name: string) => {
  if (caches[name] != null) {
    return caches[name]
  }

  const registry = getRegistry()
  const pathname = `${registry.endsWith('/') ? '' : '/'}${name}`
  const url = new URL(`${registry}${pathname}`)
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
