import * as path from 'path';
import { ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(ctx: ExtensionContext) {
  const serverModule = ctx.asAbsolutePath(path.join('out', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'tetsuo' }],
    synchronize: { configurationSection: 'tetsuo' },
  };
  client = new LanguageClient(
    'tetsuo',
    'tetsuo language server',
    serverOptions,
    clientOptions,
  );
  client.start();
}

export function deactivate() {
  return client?.stop();
}
