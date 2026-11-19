/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_BOOKS_API_KEY?: string;
}

/** Minimal typings for Google Identity Services (token model). */
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number | string;
    scope: string;
    token_type: string;
    error?: string;
    error_description?: string;
  }
  interface ClientConfigError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
    message?: string;
  }
  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: ClientConfigError) => void;
    prompt?: '' | 'none' | 'consent' | 'select_account';
    login_hint?: string;
    include_granted_scopes?: boolean;
  }
  interface OverridableTokenClientConfig {
    prompt?: '' | 'none' | 'consent' | 'select_account';
    login_hint?: string;
    scope?: string;
  }
  interface TokenClient {
    requestAccessToken(overrides?: OverridableTokenClientConfig): void;
  }
  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(token: string, done?: () => void): void;
}

interface Navigator {
  /** iOS Safari: true when running from the Home Screen. */
  standalone?: boolean;
}
