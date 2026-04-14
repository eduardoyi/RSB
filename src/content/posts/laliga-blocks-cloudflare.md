---
status: "draft"
title: "Spain Gave a Football League the Power to Block the Internet Every Weekend"
slug: "laliga-blocks-cloudflare"
date: "2026-04-14"
description: ""
featured_image: "https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/aee4c9fb-6f78-4a5e-8430-b8e45a292620/final-1776194112395.webp"
---
## His father was out there somewhere

Picture this: a Sunday afternoon in Spain. Your father has dementia. He wanders, sometimes, so you bought a GPS tracker, clipped it to his jacket, and told yourself you'd done the responsible thing. The app on your phone shows a little dot moving through the neighborhood, and that dot is the difference between a quiet afternoon and a full-scale panic.

Then the dot disappears.

You reload the app. Nothing. You check your signal. Fine. You call the care provider, hands already shaking, running through the worst versions of the next hour in your head. Where is he? How long has he been offline? Did something happen?

![The dot was gone. The spinner was frozen. A soccer ball had arrived instead.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/8ed5ae57-4795-4cb9-88b3-739e826c5f44/final-1776194011208.webp "The dot was gone. The spinner was frozen. A soccer ball had arrived instead.")

According to [posts on X](https://x.com/i/status/2041683648920031528) and [subsequent reporting](https://gigazine.net/gsc_news/en/20260413-laliga-block-cloudflare/), this is not a hypothetical. A family in Spain was in exactly this situation, frantically trying to locate a vulnerable relative through an app called PAJ Portal. The app had frozen mid-load. Support, [when contacted](https://x.com/i/status/2041101947252416573), pointed to a recurring issue: the servers the app relied on were being blocked by Spanish internet providers on weekends.

Real Madrid had kicked off twenty minutes ago.

## Yes, a football league can block your internet on weekends

Here is what actually happened, legally speaking. In December 2024, Commercial Court No. 6 in Barcelona handed [LaLiga a standing court order](https://vercel.com/blog/update-on-spain-and-laliga-blocks-of-the-internet) that lets the league tell Spanish internet providers to block IP addresses in real time during matches. No separate court approval needed for each block. No judge reviewing the list on a Saturday afternoon. LaLiga spots what it thinks is an unauthorized stream, flags the IP address behind it, and ISPs are legally required to pull the plug. The order was upheld in March 2025, and reports suggest LaLiga flags [around 3,000 IP addresses per match weekend](https://mgamble.ca/p/spain-just-proved-why-isps-cant-be-the-internets-content-police).

Think of it as a permanent permission slip. Not "please ask the court each time." Just: here is your stamp, go wild.

Now, here is where it gets genuinely insane. A huge portion of the modern internet runs through shared infrastructure. Cloudflare is the biggest example: a company that [routes traffic for an enormous slice of the web](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) by acting as a middleman between websites and their visitors. Among websites that use this kind of traffic-routing service, [Cloudflare's share sits around 80%](https://www.statista.com/chart/35487/market-share-of-reverse-proxy-services-cloudflare/).

The critical detail: thousands of completely unrelated websites share the same Cloudflare IP addresses.

![One blocked door, hundreds of tenants with nowhere to send their mail: that is what killing a shared IP address looks like in practice.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/44bd4f06-8118-433d-acab-6f61754104a3/final-1776193979667.webp "One blocked door, hundreds of tenants with nowhere to send their mail: that is what killing a shared IP address looks like in practice.")

Imagine the internet's postal system runs through one giant sorting office. Every piece of mail, from every sender, to every recipient, passes through that building. LaLiga identifies one envelope carrying a dodgy football stream. Their solution? Burn the building down. Every other letter inside, gone.

That is not a metaphor chosen for dramatic effect. That is operationally what blocking a shared Cloudflare IP does. And the Spanish government gave a private football organization, one reporting [over €5.4 billion in revenues](https://www.laliga.com/en-GB/news/laliga-reaches-a-new-historical-maximum-in-revenues-and-exceeds-17-million-spectators), the automatic, pre-approved authority to do exactly that, every single weekend.

Who signed off on this and then went home feeling good about it?

## Collateral damage report: weekend of a normal football match

Anti-theft alarms across Spain went silent. Not because burglars cut the wires. Because the alarm system's cloud backend sat behind a Cloudflare IP that LaLiga had flagged. The house was, technically, unmonitored for the duration of the second half.

Automatic doors stopped responding to remote commands. Some were stuck open. Some were stuck shut. A football league had achieved what decades of building management software could not: total consensus.

![POV: you're stuck inside the building until the end of the second half.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/4b8b42f1-e74f-40db-b789-1029e43949cc/final-1776193946373.webp "POV: you're stuck inside the building until the end of the second half.")

Developers in Spain opened their laptops on a Saturday, ran a routine `docker pull`, and got back a TLS certificate error. Not a bug in their code. Not an outage at Docker. Their request had been routed to a LaLiga block page, which introduced itself via a cryptographic mismatch that broke the entire pull. [CI pipelines timed out](https://news.ycombinator.com/item?id=47738883). GitLab jobs sat spinning. Engineers filed into Hacker News threads to compare notes on why football had eaten their afternoon.

3D printers went offline mid-job. Payment services hiccupped. Health apps dropped their connections. The [reported casualty list](https://www.techradar.com/vpn/vpn-privacy-security/la-ligas-war-on-piracy-is-breaking-the-internet-in-spain-and-your-vpn-could-be-the-next-target) reads less like an internet outage and more like a very specific curse.

And then there is the GPS tracker. The one from the opening of this piece. The little device clipped to a jacket, meant to show a moving dot on a map. It went dark during a blocking window, per [reports that circulated after the incident](https://x.com/i/status/2041190426552451487). LaLiga has denied responsibility for that one specifically. Which is a very interesting sentence to have to write in an official statement.

A football league. A dementia patient. A blank map.

## "It's Cloudflare's fault, actually"

Faced with the wreckage, LaLiga did what any organization would do after causing a multi-sector infrastructure disaster: issued a statement [blaming Cloudflare](https://www.laliga.com/en-GB/news/official-statement-in-relation-to-the-blocking-of-ips-during-the-recent-ea-sports-laliga-matchdays-linked-to-illegal-cloudflare-practices).

The February 2025 statement accused Cloudflare of "illegal practices," claimed the company was "knowingly protecting criminal organisations for profit," and alleged it had dismissed LaLiga's enforcement requests with "implausible and incoherent technical excuses." President Javier Tebas went further, telling anyone who would listen that Cloudflare was "fully aware" it hosted over 35% of LaLiga piracy in Spain and was essentially running a protection racket for pirates.

The part LaLiga left out: Cloudflare shares IP addresses across thousands of customers because that is how CDNs have worked since the late 1990s. It is not a loophole. It is the architecture. Accusing Cloudflare of inventing shared infrastructure to frustrate Spanish football rights enforcement is roughly like accusing an apartment building of being flammable on purpose.

![LaLiga, pointing at the building it set on fire, somehow with a lit match still behind its ear.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/52481bbb-4106-41aa-b365-fe51840c1790/final-1776195132978.webp "LaLiga, pointing at the building it set on fire, somehow with a lit match still behind its ear.")

LaLiga is the one who lit the match. The building just happened to be full of other people's stuff.

## If it works on football, why not everything?

When unchecked power works, the instinct is never to stop. It is to expand.

According to [a Telecompaper report from March 2026](https://www.telecompaper.com/news/telefonica-wins-court-backing-to-expand-blocking-measures-to-more-sports--1568045), a Barcelona court extended the blocking scheme beyond football to cover other live sports and entertainment, with Telefónica as a co-petitioner. Tennis. Golf. Live events. The legal infrastructure LaLiga built to protect a football match now apparently covers the full calendar of things people might want to watch from a couch. One court order to rule them all.

Then came the part that deserves its own chapter in whatever book eventually gets written about this era of internet governance.

Spanish citizens, being reasonable people who simply wanted their GPS trackers and alarm systems to work during a Clásico, started using VPNs. A privacy tool that encrypts your traffic and routes it through servers elsewhere, basically a secret underground passage for your internet connection. ProtonVPN [reported a roughly 200% spike](https://reclaimthenet.org/laliga-vpn-block-spain-court-order) in free signups from Spain after the October 2025 blocks. People were voting with their feet.

LaLiga's response was to [go back to court and get NordVPN and ProtonVPN ordered to block a dynamic list of IPs](https://www.bleepingcomputer.com/news/legal/spain-orders-nordvpn-protonvpn-to-block-laliga-piracy-sites/) too. A Córdoba court granted the order on February 17, 2026, without notifying either company first. NordVPN and ProtonVPN said they heard about it from the press. ProtonVPN publicly questioned the entire process.

![The main tunnel gets the padlock. The side tunnels stay open. The streams kept streaming.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/0fea8d85-3be5-4cf0-8e93-2a18b4a826ad/final-1776195056680.webp "The main tunnel gets the padlock. The side tunnels stay open. The streams kept streaming.")

The pirate streams, for what it is worth, [kept working anyway](https://www.pcrisk.com/internet-threat-news/34968-spanish-court-orders-nordvpn-and-protonvpn-to-block-piracy-sites). The people who actually wanted to steal football found another route. Everyone else just lost access to their privacy tools. A completely proportionate outcome.

## This isn't just Spain's problem

Here is the number that should keep internet policymakers up at night: somewhere around [75 to 80 percent of proxied web traffic in Spain](https://x.com/i/status/1912209773895778654) goes dark during a match weekend. Not because of a cyberattack. Not because of a natural disaster. Because a football organization filed the right paperwork with the right Barcelona court and a private €5 billion business now has a standing order to dim the lights on most of the country's internet, on a schedule, with no judge reviewing each individual block.

Gergely Orosz, who writes [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/) and has spent years covering how software actually works in the real world, put it plainly: the Spanish government is essentially sabotaging its own digital economy to protect the commercial interests of a private sports organization. That framing sounds extreme until you sit with it for a moment. The Spanish state, through its courts, handed a revenue-generating entertainment company the power to issue takedown orders against shared internet infrastructure, with no requirement to prove that each specific IP address is actually serving pirated content. The collateral damage to alarms, GPS trackers, developer tooling, and thousands of legitimate businesses is, apparently, an acceptable externality.

![One courtroom exchange, one key ring, and somewhere upstream a blanket order waiting to wake up and take half the internet offline with it.](https://pub-38f0f370b6cc492f84909cfc294bbc8a.r2.dev/images/97fbf981-673e-43ce-ae7d-0346f8d36f13/795f2b58-1cf2-4b59-8362-e62d01bc9cc7/final-1776194091240.webp "One courtroom exchange, one key ring, and somewhere upstream a blanket order waiting to wake up and take half the internet offline with it.")

The precedent here is the part that travels. Spain did not invent the idea of courts ordering ISPs to block content. What it did was strip away the friction. No per-block judicial review. A standing order that reactivates automatically. Extended now to tennis, golf, and live entertainment. Applied next to VPN providers. The logical next stop is any private rights holder with deep pockets and a sympathetic judge.

If a football league can get this, why not a music publisher? A film studio? A pharmaceutical company that doesn't like a news article living behind Cloudflare?

Spain sucks and I'm happy I don't live there anymore.

## Sources

- [LaLiga blocks Cloudflare IPs (Gigazine coverage)](https://gigazine.net/gsc_news/en/20260413-laliga-block-cloudflare/) — Gigazine
- [LaLiga VPN block Spain court order](https://reclaimthenet.org/laliga-vpn-block-spain-court-order) — Reclaim The Net
- [Spain's LaLiga blocks Cloudflare-range IPs; collateral damage reported](https://www.techradar.com/vpn/vpn-privacy-security/spains-laliga-blocks-us-governments-vpn-enabled-freedom-gov-in-piracy-crackdown) — TechRadar
- [Docker fails in Spain as LaLiga blocks Cloudflare IPs](https://byteiota.com/docker-fails-in-spain-la-liga-blocks-cloudflare-ips/) — ByteIota
- [Hacker News thread (id=47738883) discussing LaLiga blocks](https://news.ycombinator.com/item?id=47738883) — Hacker News
- [YouTube short referencing cloud/IP blocks (short clip)](https://www.youtube.com/shorts/duqFO5XFc7A) — YouTube
- [Hacker News thread (id=47740148) on LaLiga/Cloudflare collateral damage](https://news.ycombinator.com/item?id=47740148) — Hacker News
- [Blog: LaLiga IP blocks overview (2025–2026)](https://jgcarmona.com/laliga-blocks-2025/) — jgcarmona.com
- [VPNs blocked, collateral damage from LaLiga IP blocks](https://www.medianama.com/2026/02/223-vpns-block-illegal-la-liga-ips-in-spain/) — Medianama
- [X post (status 2040536442846241114) referencing LaLiga blocks](https://x.com/i/status/2040536442846241114) — X (Twitter)
- [X post (status 2041101947252416573) about PAJ Portal GPS outage](https://x.com/i/status/2041101947252416573) — X (Twitter)
- [X post (status 2041683648920031528) reporting app freeze during match](https://x.com/i/status/2041683648920031528) — X (Twitter)
- [X post (status 2040867100378464513) linking to local reports](https://x.com/i/status/2040867100378464513) — X (Twitter)
- [X post (status 2040898038797902065) on app support statements](https://x.com/i/status/2040898038797902065) — X (Twitter)
- [X post (status 2040550566636736566) calling for collective action](https://x.com/i/status/2040550566636736566) — X (Twitter)
- [Update on Spain and LaLiga blocks of the internet](https://vercel.com/blog/update-on-spain-and-laliga-blocks-of-the-internet) — Vercel (blog)
- [LaLiga wins court order requiring NordVPN and Proton VPN to block illegal football streams in Spain](https://www.techradar.com/vpn/vpn-privacy-security/la-liga-wins-court-order-requiring-nordvpn-and-proton-vpn-to-block-illegal-football-streams-in-spain-but-vpn-firms-say-they-have-not-been-notified) — TechRadar
- [Spain just proved why ISPs can't be the Internet's content police](https://mgamble.ca/p/spain-just-proved-why-isps-cant-be-the-internets-content-police) — M. Gamble (newsletter/blog)
- [Cloudflare statistics (market share, sites, traffic)](https://sqmagazine.co.uk/cloudflare-statistics/) — SQ Magazine
- [Cloudflare market share and statistics](https://kinsta.com/cloudflare-market-share/) — Kinsta
- [FC Barcelona generated €556.8 million in commercial revenue — leading LaLiga in 2024/2025](https://www.apd.cat/en/barcelona/the-fc-barcelona-generated-556-8-million-in-commercial-revenue-leading-laliga-in-2024-2025_5278_102.html) — APD.cat
- [Usage statistics and market share of Cloudflare](https://w3techs.com/technologies/details/cn-cloudflare) — W3Techs
- [Market share of reverse proxy services: Cloudflare](https://www.statista.com/chart/35487/market-share-of-reverse-proxy-services-cloudflare/) — Statista
- [What is a CDN? — Cloudflare Learning](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) — Cloudflare
- [What is a shared IP address and privacy/impacts](https://www.privateinternetaccess.com/blog/shared-ip-address/) — Private Internet Access (PIA) blog
- [LaLiga reaches a new historical maximum in revenues and exceeds 17 million spectators](https://www.laliga.com/en-GB/news/laliga-reaches-a-new-historical-maximum-in-revenues-and-exceeds-17-million-spectators) — LaLiga (official)
- [LaLiga financial report / consolidated figures (PDF)](https://assets.laliga.com/assets/2025/06/17/originals/ce724706eb11fb71e7b4d1638bd1ab0b.pdf) — LaLiga (official report)
- [LaLiga's war on piracy is breaking the internet in Spain — and your VPN could be the next target](https://www.techradar.com/vpn/vpn-privacy-security/la-ligas-war-on-piracy-is-breaking-the-internet-in-spain-and-your-vpn-could-be-the-next-target) — TechRadar
- [Tell HN: Docker pull fails in Spain due to football/Cloudflare block](https://app.daily.dev/posts/tell-hn-docker-pull-fails-in-spain-due-to-football-cloudflare-block-nkwjp6ivu) — daily.dev
- [Official statement in relation to the blocking of IPs during matchdays](https://www.laliga.com/en-GB/news/official-statement-in-relation-to-the-blocking-of-ips-during-the-recent-ea-sports-laliga-matchdays-linked-to-illegal-cloudflare-practices) — LaLiga (official)
- [La Liga blocking of Cloudflare IPs in Spain](https://cybersecurityadvisors.network/2025/04/15/la-liga-blocking-of-cloudflare-ips-in-spain/) — Cybersecurity Advisors (blog)
- [Spain court NordVPN / LaLiga pirate streams (coverage)](https://sqmagazine.co.uk/spain-court-nordvpn-block-laliga-pirate-streams/) — SQ Magazine
- [Spain: LaLiga recommends improvements to dynamic IP blocking proposal](https://piracymonitor.org/spain-laliga-recommends-improvements-to-dynamic-ip-blocking-proposal-which-had-failed/) — Piracy Monitor
- [Hacker News comments on related Docker/CI failures](https://news.ycombinator.com/item?id=47739575) — Hacker News (Y Combinator)
- [X post: reports of collateral damage from LaLiga blocks](https://x.com/i/status/2043465664506253709) — X (formerly Twitter)
- [X post: developers reporting Docker Hub pulls failing during matches](https://x.com/i/status/2043761608829120951) — X (formerly Twitter)
- [X post: GPS tracker failure reports (vulnerable person)](https://x.com/i/status/2041190426552451487) — X (formerly Twitter)
- [Spanish soccer league battles Cloudflare over piracy, says US company ignores illegal content](https://www.foxsports.com/articles/soccer/spanish-soccer-league-battles-cloudflare-over-piracy-says-us-company-ignores-illegal-content) — Fox Sports
- [Spanish Congress supports LaLiga's anti-piracy strategy](https://www.advanced-television.com/2025/10/23/spanish-congress-supports-la-ligas-anti-piracy-strategy/) — Advanced Television
- [Cloudflare takes legal action over LaLiga's disproportionate blocking efforts](https://www.broadbandtvnews.com/2025/02/19/cloudflare-takes-legal-action-over-laligas-disproportionate-blocking-efforts/) — Broadband TV News
- [LaLiga is confident that the European Commission will soon strengthen its recommendation on tackling online piracy in sport](https://www.laliga.com/en-GB/news/laliga-is-confident-that-the-european-commission-will-soon-strengthen-its-recommendation-on-tackling-online-piracy-in-sport) — LaLiga
- [X post: overview of LaLiga vs Cloudflare conflict (example post cited in section)](https://x.com/i/status/2023874210775658595) — X (formerly Twitter)
- [X post: examples of collateral damage to services during LaLiga matchdays](https://x.com/i/status/2043090637029872099) — X (formerly Twitter)
- [X post: legal actions and public responses in LaLiga/Cloudflare dispute (representative)](https://x.com/i/status/1859599982250082510) — X (formerly Twitter)
- [Telefónica wins court backing to expand blocking measures to more sports](https://www.telecompaper.com/news/telefonica-wins-court-backing-to-expand-blocking-measures-to-more-sports--1568045) — Telecompaper
- [Spain orders NordVPN, ProtonVPN to block LaLiga piracy sites](https://www.bleepingcomputer.com/news/legal/spain-orders-nordvpn-protonvpn-to-block-laliga-piracy-sites/) — BleepingComputer
- [Spanish court orders NordVPN and ProtonVPN to block piracy sites](https://www.pcrisk.com/internet-threat-news/34968-spanish-court-orders-nordvpn-and-protonvpn-to-block-piracy-sites) — PCRisk
- [NordVPN and Proton VPN hit with blocking orders as Spain cracks down on illegal soccer streams](https://www.tomsguide.com/computing/vpns/nordvpn-and-proton-vpn-hit-with-blocking-orders-as-spain-cracks-down-on-illegal-soccer-streams) — Tom's Guide
- [Information note on the precautionary measures granted to LaLiga against NordVPN and ProtonVPN](https://www.laliga.com/en-GB/news/information-note-on-the-precautionary-measures-granted-to-laliga-against-nordvpn-and-protonvpn) — LaLiga (official)
- [Spain: Nord VPN and Proton VPN are designated as piracy intermediaries](https://piracymonitor.org/spain-nord-vpn-and-proton-vpn-are-designated-as-piracy-intermediaries-a-win-for-rights-holders/) — PiracyMonitor
- [Wimbledon tennis expansion plans boosted by high court ruling](https://www.skysports.com/tennis/news/12110/13521856/wimbledon-tennis-expansion-plans-boosted-by-high-court-ruling-as-grand-slam-site-looks-to-triple-in-size) — Sky Sports
- [2026-03-20 Wimbledon expansion plans receive high court boost](https://www.wimbledon.com/en_GB/news/articles/2026-03-20/2026-03-20_wimbledon_expansion_plans_receive_high_court_boost.html) — Wimbledon.com
- [Hacker News thread on LaLiga/Cloudflare blocks](https://news.ycombinator.com/item?id=47114235) — Hacker News
- [X status (LaLiga/ VPN block reporting)](https://x.com/i/status/2023730011195232257) — X (formerly Twitter)
- [Report: Spain ordered NordVPN and ProtonVPN to block pirate football streams without notice](https://hackyourmom.com/en/novyny/ispaniya-nakazala-nordvpn-i-protonvpn-blokuvaty-piratski-futbolni-translyacziyi-bez-poperedzhennya/) — HackYourMom
- [Football is without borders — except in the digital space](https://www.brusselsreport.eu/2025/04/22/football-is-without-borders-except-in-the-digital-space/) — Brussels Report
- [Cloudflare vs La Liga](https://daniel.es/blog/cloudflare-vs-la-liga/) — daniel.es (blog)
- [X thread/post by Gergely Orosz (1912209773895778654)](https://x.com/i/status/1912209773895778654) — X (formerly Twitter) — Gergely Orosz
- [X post on LaLiga IP-blocking precedent (1914292322692698166)](https://x.com/i/status/1914292322692698166) — X
- [X thread reporting overblocking and collateral damage (1982471688232079786)](https://x.com/i/status/1982471688232079786) — X
- [X post on legal challenges and censorship concerns (1968328692070822288)](https://x.com/i/status/1968328692070822288) — X
- [X post referencing court extensions to intermediaries (2043254064910041285)](https://x.com/i/status/2043254064910041285) — X
- [X post about weekly blocks and precedents (2023814208865910979)](https://x.com/i/status/2023814208865910979) — X
- [X post reporting collateral-hit counts and VPN demand (2025643188321714642)](https://x.com/i/status/2025643188321714642) — X
- [X post on potential Constitutional Court appeal and criticism (2043092268345704479)](https://x.com/i/status/2043092268345704479) — X
- [X post documenting matchday blocks starting earlier than expected (1982658765150384150)](https://x.com/i/status/1982658765150384150) — X
