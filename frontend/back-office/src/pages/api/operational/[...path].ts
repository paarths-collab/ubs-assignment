import type { NextApiRequest, NextApiResponse } from 'next';
import { operationalBridge } from '../../../server/operational';

export const config = { api: { bodyParser: false, externalResolver: true, responseLimit: false } };
export const maxDuration = 60;

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  const segments = request.query.path;
  await operationalBridge(request, response, Array.isArray(segments) ? segments : []);
}
