import type { ExtensionContext } from 'vscode'

import { registerPnpmWorkspace } from '~/pnpm'

export function activate(context: ExtensionContext) {
  console.log('VSCode Pnpm Version Lens activated')

  registerPnpmWorkspace(context)
}

export function deactivate() {
  console.log('VSCode Pnpm Version Lens deactivate')
}
