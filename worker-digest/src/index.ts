interface Env {
	POSTHOG_HOST: string;
	POSTHOG_PROJECT_ID: string;
	POSTHOG_PERSONAL_API_KEY: string;
	RESEND_API_KEY: string;
	EMAIL_TO: string;
	EMAIL_FROM: string;
}

interface TrendResult {
	label: string;
	count: number;
	data: number[];
	aggregated_value?: number;
	breakdown_value?: string;
	action: { custom_name?: string };
}

interface QueryResponse {
	results: TrendResult[];
}

async function queryPostHog(env: Env, query: object): Promise<QueryResponse> {
	const res = await fetch(`${env.POSTHOG_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
		},
		body: JSON.stringify({ query }),
	});
	if (!res.ok) throw new Error(`PostHog API error: ${res.status} ${await res.text()}`);
	return res.json();
}

async function getDigestData(env: Env) {
	const [visitors, pages, referrers, browsers, countries, cities] = await Promise.all([
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [
					{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" },
					{ kind: "EventsNode", event: "$pageview", custom_name: "Unique Visitors", math: "dau" },
				],
				dateRange: { date_from: "-1d", date_to: "-1d" },
				interval: "day",
			},
		}),
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" }],
				breakdownFilter: { breakdown: "$pathname", breakdown_type: "event" },
				dateRange: { date_from: "-1d", date_to: "-1d" },
				trendsFilter: { display: "ActionsBarValue" },
			},
		}),
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" }],
				breakdownFilter: { breakdown: "$referring_domain", breakdown_type: "event" },
				dateRange: { date_from: "-1d", date_to: "-1d" },
				trendsFilter: { display: "ActionsBarValue" },
			},
		}),
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" }],
				breakdownFilter: { breakdown: "$browser", breakdown_type: "event" },
				dateRange: { date_from: "-1d", date_to: "-1d" },
				trendsFilter: { display: "ActionsBarValue" },
			},
		}),
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" }],
				breakdownFilter: { breakdown: "$geoip_country_name", breakdown_type: "event" },
				dateRange: { date_from: "-1d", date_to: "-1d" },
				trendsFilter: { display: "ActionsBarValue" },
			},
		}),
		queryPostHog(env, {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [{ kind: "EventsNode", event: "$pageview", custom_name: "Pageviews", math: "total" }],
				breakdownFilter: { breakdown: "$geoip_city_name", breakdown_type: "event" },
				dateRange: { date_from: "-1d", date_to: "-1d" },
				trendsFilter: { display: "ActionsBarValue" },
			},
		}),
	]);

	const pageviews = visitors.results[0]?.aggregated_value ?? visitors.results[0]?.data?.reduce((a, b) => a + b, 0) ?? 0;
	const uniques = visitors.results[1]?.aggregated_value ?? visitors.results[1]?.data?.reduce((a, b) => a + b, 0) ?? 0;

	const topPages = pages.results
		.sort((a, b) => (b.aggregated_value ?? 0) - (a.aggregated_value ?? 0))
		.slice(0, 10)
		.map((r) => ({ path: r.breakdown_value ?? r.label, views: r.aggregated_value ?? 0 }));

	const topReferrers = referrers.results
		.sort((a, b) => (b.aggregated_value ?? 0) - (a.aggregated_value ?? 0))
		.slice(0, 5)
		.map((r) => ({ domain: r.breakdown_value === "$direct" ? "Direct" : (r.breakdown_value ?? r.label), views: r.aggregated_value ?? 0 }));

	const browserList = browsers.results
		.sort((a, b) => (b.aggregated_value ?? 0) - (a.aggregated_value ?? 0))
		.slice(0, 5)
		.map((r) => ({ browser: r.breakdown_value ?? r.label, views: r.aggregated_value ?? 0 }));

	const topCountries = countries.results
		.sort((a, b) => (b.aggregated_value ?? 0) - (a.aggregated_value ?? 0))
		.slice(0, 10)
		.map((r) => ({ country: r.breakdown_value ?? r.label, views: r.aggregated_value ?? 0 }));

	const topCities = cities.results
		.sort((a, b) => (b.aggregated_value ?? 0) - (a.aggregated_value ?? 0))
		.slice(0, 10)
		.map((r) => ({ city: r.breakdown_value ?? r.label, views: r.aggregated_value ?? 0 }));

	return { pageviews, uniques, topPages, topReferrers, browserList, topCountries, topCities };
}

function formatDate(d: Date): string {
	return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function buildEmail(data: Awaited<ReturnType<typeof getDigestData>>): { subject: string; html: string } {
	const yesterday = new Date(Date.now() - 86400000);
	const dateStr = formatDate(yesterday);

	const pagesRows = data.topPages.length > 0
		? data.topPages.map((p) => `<tr><td style="padding:4px 12px 4px 0">${p.path}</td><td style="padding:4px 0;text-align:right">${p.views}</td></tr>`).join("")
		: '<tr><td style="padding:4px 0;color:#888">No pageviews</td></tr>';

	const referrerRows = data.topReferrers.length > 0
		? data.topReferrers.map((r) => `<tr><td style="padding:4px 12px 4px 0">${r.domain}</td><td style="padding:4px 0;text-align:right">${r.views}</td></tr>`).join("")
		: '<tr><td style="padding:4px 0;color:#888">No referrers</td></tr>';

	const browserRows = data.browserList.length > 0
		? data.browserList.map((b) => `<tr><td style="padding:4px 12px 4px 0">${b.browser}</td><td style="padding:4px 0;text-align:right">${b.views}</td></tr>`).join("")
		: '<tr><td style="padding:4px 0;color:#888">No data</td></tr>';

	const countryRows = data.topCountries.length > 0
		? data.topCountries.map((c) => `<tr><td style="padding:4px 12px 4px 0">${c.country}</td><td style="padding:4px 0;text-align:right">${c.views}</td></tr>`).join("")
		: '<tr><td style="padding:4px 0;color:#888">No data</td></tr>';

	const cityRows = data.topCities.length > 0
		? data.topCities.map((c) => `<tr><td style="padding:4px 12px 4px 0">${c.city}</td><td style="padding:4px 0;text-align:right">${c.views}</td></tr>`).join("")
		: '<tr><td style="padding:4px 0;color:#888">No data</td></tr>';

	const html = `
<div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;color:#222">
  <h2 style="margin:0 0 4px">RSB Daily Digest</h2>
  <p style="margin:0 0 20px;color:#666">${dateStr}</p>

  <div style="display:flex;gap:24px;margin-bottom:24px">
    <div style="background:#f5f5f5;padding:16px 24px;border-radius:8px;text-align:center">
      <div style="font-size:32px;font-weight:bold">${data.pageviews}</div>
      <div style="color:#666;font-size:14px">Pageviews</div>
    </div>
    <div style="background:#f5f5f5;padding:16px 24px;border-radius:8px;text-align:center">
      <div style="font-size:32px;font-weight:bold">${data.uniques}</div>
      <div style="color:#666;font-size:14px">Unique Visitors</div>
    </div>
  </div>

  <h3 style="margin:0 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">Top Pages</h3>
  <table style="width:100%;margin-bottom:24px;font-size:14px">${pagesRows}</table>

  <h3 style="margin:0 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">Referrers</h3>
  <table style="width:100%;margin-bottom:24px;font-size:14px">${referrerRows}</table>

  <h3 style="margin:0 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">Browsers</h3>
  <table style="width:100%;margin-bottom:24px;font-size:14px">${browserRows}</table>

  <h3 style="margin:0 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">Countries</h3>
  <table style="width:100%;margin-bottom:24px;font-size:14px">${countryRows}</table>

  <h3 style="margin:0 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">Cities</h3>
  <table style="width:100%;margin-bottom:24px;font-size:14px">${cityRows}</table>

  <p style="font-size:12px;color:#999;margin-top:32px">Sent by rsb-digest worker</p>
</div>`;

	return {
		subject: `RSB Digest: ${data.pageviews} pageviews, ${data.uniques} visitors — ${yesterday.toISOString().split("T")[0]}`,
		html,
	};
}

async function sendEmail(env: Env, subject: string, html: string) {
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
		},
		body: JSON.stringify({
			from: env.EMAIL_FROM,
			to: [env.EMAIL_TO],
			subject,
			html,
		}),
	});
	if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
	return res.json();
}

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const data = await getDigestData(env);
		const { subject, html } = buildEmail(data);
		ctx.waitUntil(sendEmail(env, subject, html));
	},

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/test") {
			const data = await getDigestData(env);
			const { subject, html } = buildEmail(data);
			await sendEmail(env, subject, html);
			return new Response(`Sent: ${subject}`, { status: 200 });
		}
		return new Response("rsb-digest worker. Use cron trigger or GET /test to send a test email.", { status: 200 });
	},
} satisfies ExportedHandler<Env>;
