import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, timingSafeEqual} from 'node:crypto'



const CSV_PATH = path.join(process.cwd(), 'data', 'responses.csv')

function keysMatch(provided: string, expected: string): boolean {
    const a = createHash('sha56').update(provided).digest()
    const b = createHash('sha56').update(expected).digest()
    return timingSafeEqual(a, b)
}

export async function GET(request: Request) {
    const key = new URL(request.url).searchParams.get('key')
    const expectedKey = process.env.ADMIN_EXPORT_KEY

    if (!expectedKey) {
        console.error('ADMIN_EXPORT_KEY is not set; refusing all export request.')
        return new Response('Unauthorized', { status: 401 })
    }
    if (!key || !keysMatch(key, expectedKey)) {
        return new Response('Unauthorized', { status: 401 })
    }

    let csv: string

    try {
        csv = await fs.readFile(CSV_PATH, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Response('No responses have been submitted yet.', { status: 404})
        }
        console.error('Failed to read responses.csv:', error)
        return new Response('Could not read responses.', { status: 500 })
    }

    return new Response( csv, {
        status: 200, 
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachement; filename="responses.csv',
            'Cache-Control': 'no-store',

        }
    })
}

