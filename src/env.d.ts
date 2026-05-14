/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare namespace App {
	interface Locals {
		cfContext: ExecutionContext;
	}
}

declare module 'cloudflare:workers' {
	const env: {
		NEWSLETTER_DB: D1Database;
		PUBLIC_MAPBOX_ACCESS_TOKEN: string;
		TELEGRAM_BOT_TOKEN?: string;
		TELEGRAM_CHAT_ID?: string;
	};
	export { env };
}
