import { Suspense } from "react";
import ConfirmationApp from "../ConfirmationApp";

type SearchParams = Promise<{
  participantNumber?: string;
  conditionNumber?: string;
  token?: string;
}>;

// Reading searchParams is request-time data, so it happens inside <Suspense>.
async function TreatmentContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // The link carries no name. The first name is looked up on the server from the
  // link's random token, and is used only for the greeting.

  return (
    <ConfirmationApp
      condition="treatment"
      participantNumber={params.participantNumber || ""}
      conditionNumber={params.conditionNumber || ""}
    />
  );
}

export default function TreatmentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <div className="single-interface">
            <div className="confirmation-card" aria-busy="true" />
          </div>
        </main>
      }
    >
      <TreatmentContent searchParams={searchParams} />
    </Suspense>
  );
}
