const extractSymbolFromVersionRegex = /^([^0-9]*)?(.*)$/
const semverLeadingChars = ['^', '~', '<', '<=', '>', '>=', '~>']
const isHasLeading = (leading: string) => semverLeadingChars.includes(leading)

export const parseVersion = (version: string) => {
  const result = extractSymbolFromVersionRegex.exec(version)
  const [, leadingChars, versionChars] = result ?? []

  const isLeading = isHasLeading(leadingChars)
  const isValid = extractSymbolFromVersionRegex.test(version)
  const isFixed = isValid && !isLeading
  const parsed: DepVersion = {
    leading: isValid && isLeading ? leadingChars : '',
    version: isValid ? versionChars : '',
    isFixed,
    isValid,
  }
  return parsed
}

interface DepVersion {
  leading: string
  version: string
  isFixed: boolean
  isValid: boolean
}
