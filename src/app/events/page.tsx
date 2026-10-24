import React from "react";
import { getEventTickets } from "@/lib/store";
import EventsClient from "@/components/EventsClient";
import { buildEventJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const tickets = await getEventTickets();
  const eventsJsonLd = tickets.map((t) =>
    buildEventJsonLd({
      slug: t.slug,
      title: t.title,
      description: t.description,
      eventDate: t.eventDate,
      priceNis: t.money?.price,
    })
  );

  return (
    <>
      <script
        type="application/ld+json"
        data-testid="jsonld-events"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
      />
      <EventsClient tickets={tickets} />
    </>
  );
}
