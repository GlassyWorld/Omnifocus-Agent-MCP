import type { RequestHandlerExtra as SdkRequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

// Current SDK versions require generic arguments for RequestHandlerExtra,
// while the existing Tool definitions import that name without generics.
// Tool definitions import this shim explicitly so they share the exact public
// server request/notification context without overriding an SDK module path.
// Remove this shim once Tool definitions use explicit SDK generics or the SDK
// provides compatible defaults.
export type RequestHandlerExtra = SdkRequestHandlerExtra<
  ServerRequest,
  ServerNotification
>;
