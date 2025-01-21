import type {
  CodeLens,
  CodeLensProvider,
  DocumentSelector,
  ExtensionContext,
  TextDocument,
} from 'vscode'

import { gt } from 'semver'
import { Range, WorkspaceEdit, commands, languages, workspace } from 'vscode'
import YAML from 'yaml'

import { fetchLatestVersion, fetchSatisfiesVersion } from '~/npm'
import { isNumber, isString, parseVersion } from '~/utils'

export const registerPnpmWorkspace = (_: ExtensionContext) => {
  registerSuggestionApplyCommands()
  registerSuggestionCodelenes()
}

export const registerSuggestionApplyCommands = () => {
  commands.registerCommand('pnpm-verlens.suggestion.apply', (apply) =>
    apply?.(),
  )
}

export const registerSuggestionCodelenes = () => {
  const selector: DocumentSelector = {
    language: 'yaml',
    pattern: '**/pnpm-workspace.yaml',
  }
  const provider = createCodeLensProvider()
  languages.registerCodeLensProvider(selector, provider)
}

const createCodeLensProvider = () => {
  const provider: CodeLensProvider<DepCodeLens> = {
    provideCodeLenses: (document) => {
      const txt = document.getText()
      const doc = YAML.parseDocument(txt)

      const deps = [
        ...parseDeps(document, doc.get('catalog')),
        ...parseDeps(document, doc.get('catalogs')),
      ]
      return parseCodelenses(deps)
    },

    resolveCodeLens: async (codeLens) => {
      switch (codeLens.tag) {
        case 'fixed':
          return await resolveFixedVersionCodeLens(codeLens)
        case 'latest':
          return await resolveLatestVersionCodeLens(codeLens)
        case 'satisfies':
          return await resolveSatisfiesVersionCodeLens(codeLens)
        case 'flag':
          return await resolveFlagCodeLens(codeLens)
        default:
          return null
      }
    },
  }
  return provider
}

const parseDeps = (doc: TextDocument, node: unknown) => {
  const deps: Dep[] = []
  if (!YAML.isMap(node)) return []

  for (const pair of node.items) {
    const node = pair.value
    if (YAML.isMap(node)) {
      deps.push(...parseDeps(doc, node))
    } else if (isDepPair(pair)) {
      deps.push(parseDep(doc, pair))
    }
  }
  return deps
}

const parseDep = (doc: TextDocument, pair: DepPair) => {
  const name = parseDepName(doc, pair)
  const version = parseDepVersion(doc, pair)
  const suggestions = parseDepSuggestions(name.value, version.value)

  const dep: Dep = {
    doc,
    name,
    version,
    suggestions,
  }

  return dep
}

const parseDepName = (doc: TextDocument, pair: DepPair) => {
  const scalar = pair.key
  const value = parseDepKeyValue(scalar.value)
  const range = parseScalarRange(doc, scalar.range)
  if (range == null) {
    throw new Error(`Can not parse dep name range: ${value}`)
  }

  const name: Dep['name'] = {
    value: value,
    range: range,
  }
  return name
}

const parseDepVersion = (doc: TextDocument, pair: DepPair) => {
  const valScalar = pair.value
  const value = parseDepValValue(valScalar?.value)
  const range = parseScalarRange(doc, valScalar?.range)
  const quote = parseScalarQuote(valScalar?.type)

  const version: Dep['version'] = {
    value: value,
    range: range,
    quote: quote,
  }
  return version
}

const parseDepSuggestions = async (name: string, version?: string) => {
  const suggestions: DepSuggestions = {
    flag: '🔴',
    latest: {
      version: null,
      isUpdateable: false,
    },
    satisfies: {
      version: null,
      isUpdateable: false,
    },
  }

  const latest = await fetchLatestVersion(name)
  if (latest == null) {
    suggestions.flag = '🔴 package not found'
    return suggestions
  }

  if (latest != null) {
    const ver = parseVersion(version)
    const isUpdateable = version == null ? true : gt(latest, ver.version)
    suggestions.latest.version = latest
    suggestions.latest.isUpdateable = isUpdateable
    suggestions.flag = isUpdateable ? '🟡' : '✔️'
    return suggestions
  }

  const satisfies = await fetchSatisfiesVersion(name, version)
  if (satisfies != null) {
    const ver = parseVersion(version)
    const isUpdateable = version == null ? true : gt(satisfies, ver.version)
    suggestions.satisfies.version = latest
    suggestions.satisfies.isUpdateable = isUpdateable
    suggestions.flag = isUpdateable ? '🟡' : '✔️'
    return suggestions
  }

  return suggestions
}

const parseDepKeyValue = (value: unknown) => {
  if (isString(value)) {
    return value
  }

  if (isNumber(value)) {
    return String(value)
  }

  throw new Error(`Can not parse dep key: ${value}`)
}

const parseDepValValue = (value: unknown) => {
  if (isString(value)) {
    return value
  }

  if (isNumber(value)) {
    return String(value)
  }

  if (value == null) {
    return null
  }

  throw new Error(`Can not parse dep value: ${value}`)
}

const parseScalarRange = (doc: TextDocument, range?: YAML.Range | null) => {
  if (range == null) {
    return null
  }

  const [start, end] = range
  return new Range(doc.positionAt(start), doc.positionAt(end))
}

const parseScalarQuote = (type?: YAML.Scalar['type'] | null) => {
  switch (type) {
    case 'QUOTE_DOUBLE':
      return `\"`
    case 'QUOTE_SINGLE':
      return `\'`
    default:
      return ''
  }
}

const isDepPair = (node: unknown): node is DepPair => {
  return YAML.isPair(node)
}

type DepPair = YAML.Pair<DepPairKey, DepPairVal>
type DepPairKey = YAML.Scalar<string>
type DepPairVal = YAML.Scalar<string | number>

interface Dep {
  doc: TextDocument
  name: DepKey<string>
  version: DepVal<string>
  suggestions: Promise<DepSuggestions>
}

interface DepSuggestions {
  flag: string

  latest: {
    version: string | null
    isUpdateable: boolean
  }
  satisfies: {
    version: string | null
    isUpdateable: boolean
  }
}

interface DepKey<T> {
  value: T
  range: Range
}

interface DepVal<T> {
  value: T | null
  range: Range
  quote: string
}

type DepType = 'npm'
type DepTag = 'fixed' | 'latest' | 'satisfies' | 'flag'

interface DepCodeLens extends CodeLens {
  type: DepType
  tag: DepTag
  dep: Dep
}

export const parseCodelenses = (deps: Dep[]) => {
  const codelenses: DepCodeLens[] = []

  for (const dep of deps) {
    codelenses.push(createCodelens('fixed', dep))
    codelenses.push(createCodelens('latest', dep))
    codelenses.push(createCodelens('satisfies', dep))
    codelenses.push(createCodelens('flag', dep))
  }

  return codelenses
}

const createCodelens = (tag: DepTag, dep: Dep) => {
  const range = dep.name.range
  const codelens: DepCodeLens = {
    type: 'npm',
    isResolved: false,
    tag,
    range,
    dep,
  }
  return codelens
}

const resolveFixedVersionCodeLens = async (codeLens: DepCodeLens) => {
  const dep = codeLens.dep
  const version = dep.version.value
  if (version == null) {
    return null
  }

  const name = dep.name.value
  const latest = await fetchLatestVersion(name)
  if (version === latest) {
    return null
  }

  const { isFixed } = parseVersion(version)
  if (!isFixed) {
    return null
  }

  codeLens.command = {
    title: `fixed: ${version}`,
    command: '',
  }

  return codeLens
}

const resolveLatestVersionCodeLens = async (codeLens: DepCodeLens) => {
  const dep = codeLens.dep
  const versionRange = dep.version.range
  if (versionRange == null) {
    return null
  }

  const latest = await fetchLatestVersion(dep.name.value)
  if (latest == null) {
    return null
  }

  const { version } = parseVersion(dep.version.value)
  const isUpdateable = dep.version.value == null ? true : gt(latest, version)
  const flag = isUpdateable ? '↑' : ''

  codeLens.command = {
    title: `latest: ${flag}${latest}`,
    command: isUpdateable ? 'pnpm-verlens.suggestion.apply' : '',
    arguments: [
      () => {
        const edit = new WorkspaceEdit()
        const { doc } = dep
        edit.replace(doc.uri, versionRange, parseApplyVersion(dep, latest))
        workspace.applyEdit(edit)
      },
    ],
  }

  return codeLens
}

const resolveSatisfiesVersionCodeLens = async (codeLens: DepCodeLens) => {
  const dep = codeLens.dep
  const versionRange = dep.version.range
  if (versionRange == null) {
    return null
  }

  const depVersion = dep.version.value
  const { isValid, version } = parseVersion(depVersion)
  if (!isValid) {
    return null
  }

  const name = dep.name.value
  const satisfiesVersion = await fetchSatisfiesVersion(name, depVersion)
  if (satisfiesVersion == null) {
    return null
  }

  if (version === satisfiesVersion) {
    return null
  }

  const isUpdateable = gt(satisfiesVersion, version)
  const flag = isUpdateable ? '↑' : ''

  codeLens.command = {
    title: `satisfies: ${flag}${satisfiesVersion}`,
    command: isUpdateable ? 'pnpm-verlens.suggestion.apply' : '',
    arguments: [
      () => {
        const edit = new WorkspaceEdit()
        const { doc } = dep
        edit.replace(
          doc.uri,
          versionRange,
          parseApplyVersion(dep, satisfiesVersion),
        )
        workspace.applyEdit(edit)
      },
    ],
  }

  return codeLens
}

const resolveFlagCodeLens = async (codeLens: DepCodeLens) => {
  const dep = codeLens.dep

  const suggestions = await dep.suggestions
  codeLens.command = { title: suggestions.flag, command: '' }

  return codeLens
}

export function parseApplyVersion(dep: Dep, version: string) {
  const depVersion = dep.version.value
  if (depVersion == null) {
    return ` ${version}`
  }
  const { leading, isValid } = parseVersion(depVersion)
  if (!isValid) {
    return ` ${version}`
  }

  const quote = dep.version.quote
  return `${quote}${leading}${version}${quote}`
}
