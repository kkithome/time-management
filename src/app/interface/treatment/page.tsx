
import { Suspense } from 'react'
import ConfirmationApp from '../ConfirmationApp'
 
type SearchParams = Promise<{
  participantName?: string
  participantNumber?: string
  conditionNumber?: string
}>
 
// Reading searchParams is request-time data, so it happens inside <Suspense>.
async function TreatmentContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
 
  return (
    <ConfirmationApp
      condition="treatment"
      participantName={params.participantName || 'Participant'}
      participantNumber={params.participantNumber || ''}
      conditionNumber={params.conditionNumber || ''}
    />
  )
}
 
export default function TreatmentPage({ searchParams }: { searchParams: SearchParams }) {
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
  )
}