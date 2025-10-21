import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function odooCall<T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}): Promise<T> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [
        ODOO_DB,
        params.uid,
        params.password,
        params.model,
        params.method,
        params.args,
        params.kwargs || {},
      ],
    },
    id: Date.now(),
  };

  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  
  if (json.error) {
    console.error('❌ Odoo Error:', JSON.stringify(json.error, null, 2));
    throw new Error(json.error.data?.message || json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const { amount, customerId, customerName, email, expiryDate } = req.body;

    console.log('🎁 Create Gift Voucher Request - Amount:', amount, 'Customer:', customerName);

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount is required and must be greater than 0' });
    }

    // Try to find gift card program - try multiple names (production vs dev)
    // Also try without active filter and without type filter
    const programNames = ['Cadeaubonnen', 'Geschenkbon', 'Gift Cards'];
    let programs: any[] = [];

    for (const programName of programNames) {
      // Try with Dutch language context (nl_BE)
      programs = await odooCall<any[]>({
        uid,
        password,
        model: 'loyalty.program',
        method: 'search_read',
        args: [[
          ['name', '=', programName],
          ['program_type', '=', 'gift_card']
        ]],
        kwargs: {
          fields: ['id', 'name', 'program_type'],
          limit: 1,
          context: { 'active_test': false, 'lang': 'nl_BE' },
        },
      });

      if (programs.length > 0) {
        console.log(`✅ Found loyalty program: "${programName}" (ID: ${programs[0].id}, Type: ${programs[0].program_type})`);
        break;
      } else {
        console.log(`❌ "${programName}" not found with lang context`);
      }
    }

    if (programs.length === 0) {
      console.log('❌ No gift card program found. Tried:', programNames);
      return res.status(404).json({ 
        error: 'Geen gift card programma gevonden. Geprobeerd: ' + programNames.join(', '),
      });
    }

    const programId = programs[0].id;
    console.log('✅ Found loyalty program:', programs[0].name, '(ID:', programId, ')');

    // Use customer ID if provided (from search selection)
    let partnerId: number | false = false;
    
    if (customerId) {
      // Customer was selected from search dropdown
      partnerId = customerId;
      console.log('✅ Using selected customer ID:', partnerId);
    } else if (customerName && customerName.trim()) {
      // Customer name entered manually (fallback - not recommended)
      const existingPartners = await odooCall<any[]>({
        uid,
        password,
        model: 'res.partner',
        method: 'search_read',
        args: [[['name', '=', customerName.trim()]]],
        kwargs: {
          fields: ['id', 'name'],
          limit: 1,
        },
      });

      if (existingPartners.length > 0) {
        partnerId = existingPartners[0].id;
        console.log('✅ Found existing customer by name:', partnerId);
      } else {
        const newPartnerId = await odooCall<number>({
          uid,
          password,
          model: 'res.partner',
          method: 'create',
          args: [{
            name: customerName.trim(),
            email: email || false,
            customer_rank: 1,
          }],
        });
        partnerId = newPartnerId;
        console.log('✅ Created new customer:', partnerId);
      }
    } else {
      // No customer specified - leave partner_id as false for anonymous voucher
      console.log('ℹ️ No customer specified - creating anonymous voucher');
    }

    // Create the loyalty card directly (simpler approach)
    const cardData: any = {
      program_id: programId,
      points: amount,
    };

    // Only add partner_id if customer was specified
    if (partnerId !== false) {
      cardData.partner_id = partnerId;
    }

    if (expiryDate) {
      cardData.expiration_date = expiryDate;
    }

    console.log('Creating loyalty card with data:', JSON.stringify(cardData, null, 2));

    // Create the loyalty card
    const cardId = await odooCall<number>({
      uid,
      password,
      model: 'loyalty.card',
      method: 'create',
      args: [cardData],
    });

    console.log('✅ Created loyalty card:', cardId);

    // Get the created card details with the generated code
    const cards = await odooCall<any[]>({
      uid,
      password,
      model: 'loyalty.card',
      method: 'search_read',
      args: [[['id', '=', cardId]]],
      kwargs: {
        fields: ['id', 'code', 'points', 'expiration_date', 'partner_id'],
        limit: 1,
      },
    });

    const voucher = cards[0];

    console.log('✅ Gift voucher created successfully:', voucher);

    return res.status(200).json({
      success: true,
      voucher: voucher,
      message: voucher && voucher.code
        ? `Cadeaubon aangemaakt! Code: ${voucher.code}` 
        : 'Cadeaubon aangemaakt!',
    });
  } catch (error) {
    console.error('❌ Error creating gift voucher:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon cadeaubon niet aanmaken' 
    });
  }
}

