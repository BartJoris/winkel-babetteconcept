import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentToPdfBuffer,
  collectOrderAttachments,
  findOrderInvoiceAttachment,
  findOrderShippingLabelAttachment,
  isInvoiceAttachmentName,
  isPdfAttachment,
  isShippingLabelAttachmentName,
  isValidPdfBuffer,
  odooJson2Url,
  type OrderAttachmentsOdooCall,
} from './order-attachments';

const SAMPLE_PDF_BASE64 =
  'JVBERi0xLjQKJcOkw7zDtsO4CjEgMCBvYmogPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago=';

function domainResId(args: unknown[]): unknown {
  const domain = args[0];
  if (!Array.isArray(domain)) return undefined;
  const clause = domain.find(
    (item) => Array.isArray(item) && item[0] === 'res_id'
  );
  return Array.isArray(clause) ? clause[2] : undefined;
}

type OrderAttachmentsOdooCallParams = {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
};

describe('order attachment helpers', () => {
  it('builds the Odoo JSON-2 attachment read URL from jsonrpc', () => {
    assert.equal(
      odooJson2Url('https://www.babetteconcept.be/jsonrpc', 'ir.attachment', 'read'),
      'https://www.babetteconcept.be/json/2/ir.attachment/read'
    );
  });
  it('detects pdf attachments by name and mimetype', () => {
    assert.equal(isPdfAttachment({ name: 'Order.pdf', mimetype: false }), true);
    assert.equal(isPdfAttachment({ name: 'label.txt', mimetype: 'application/pdf' }), true);
    assert.equal(isPdfAttachment({ name: 'notes.txt', mimetype: 'text/plain' }), false);
  });

  it('classifies invoice and shipping label names', () => {
    assert.equal(isInvoiceAttachmentName('Order - SO123.pdf'), true);
    assert.equal(isInvoiceAttachmentName('Sendcloud shipping label.pdf'), false);
    assert.equal(isShippingLabelAttachmentName('Sendcloud shipping label.pdf'), true);
  });

  it('rejects bin_size placeholders and accepts valid pdf buffers', () => {
    assert.equal(
      attachmentToPdfBuffer({ id: 1, name: 'Order.pdf', datas: '4.2 Kb' }),
      null
    );

    const fromDatas = attachmentToPdfBuffer({
      id: 1,
      name: 'Order.pdf',
      datas: SAMPLE_PDF_BASE64,
    });
    assert.ok(fromDatas);
    assert.equal(isValidPdfBuffer(fromDatas), true);

    const fromRawDict = attachmentToPdfBuffer({
      id: 2,
      name: 'Order.pdf',
      raw: { filename: 'Order.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
    });
    assert.ok(fromRawDict);
    assert.equal(isValidPdfBuffer(fromRawDict), true);
  });

  it('reads attachments via raw with include_binary_content, not the removed datas field', async () => {
    const odooCall: OrderAttachmentsOdooCall = async <T>(
      params: OrderAttachmentsOdooCallParams
    ) => {
      switch (`${params.model}:${params.method}`) {
        case 'ir.attachment:search_read':
          if (domainResId(params.args) === 42) {
            return [
              {
                id: 10,
                name: 'Order - SO42.pdf',
                mimetype: 'application/pdf',
                res_model: 'sale.order',
                res_id: 42,
              },
            ] as T;
          }
          if (domainResId(params.args) === 900) {
            return [
              {
                id: 11,
                name: 'Sendcloud label SO42.pdf',
                mimetype: 'application/pdf',
                res_model: 'stock.picking',
                res_id: 900,
              },
            ] as T;
          }
          return [] as T;
        case 'sale.order:read':
          return [{ invoice_ids: [] }] as T;
        case 'stock.picking:search_read':
          return [{ id: 900 }] as T;
        case 'ir.attachment:read': {
          const fields = params.kwargs?.fields;
          assert.equal(Array.isArray(fields) && fields.includes('raw'), true);
          assert.equal(Array.isArray(fields) && fields.includes('datas'), false);
          assert.deepEqual(params.kwargs?.context, {
            include_binary_content: true,
            bin_size: false,
          });
          return [
            {
              id: 10,
              name: 'Order - SO42.pdf',
              mimetype: 'application/pdf',
              raw: { filename: 'Order - SO42.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
              res_model: 'sale.order',
              res_id: 42,
            },
            {
              id: 11,
              name: 'Sendcloud label SO42.pdf',
              mimetype: 'application/pdf',
              raw: { filename: 'Sendcloud label SO42.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
              res_model: 'stock.picking',
              res_id: 900,
            },
          ] as T;
        }
        default:
          throw new Error(`Unexpected call ${params.model}.${params.method}`);
      }
    };

    const attachments = await collectOrderAttachments(odooCall, 1, 'secret', 42);
    assert.equal(attachments.length, 2);

    const invoice = await findOrderInvoiceAttachment(odooCall, 1, 'secret', 42);
    assert.equal(invoice?.attachment.name, 'Order - SO42.pdf');

    const label = await findOrderShippingLabelAttachment(odooCall, 1, 'secret', 42);
    assert.equal(label?.attachment.name, 'Sendcloud label SO42.pdf');
  });

  it('falls back to datas when raw is not a valid field', async () => {
    const fieldsRequested: string[][] = [];

    const odooCall: OrderAttachmentsOdooCall = async <T>(
      params: OrderAttachmentsOdooCallParams
    ) => {
      switch (`${params.model}:${params.method}`) {
        case 'ir.attachment:search_read':
          return [
            {
              id: 10,
              name: 'Order - SO42.pdf',
              mimetype: 'application/pdf',
              res_model: 'sale.order',
              res_id: 42,
            },
          ] as T;
        case 'sale.order:read':
          return [{ invoice_ids: [] }] as T;
        case 'stock.picking:search_read':
          return [] as T;
        case 'ir.attachment:read': {
          const fields = Array.isArray(params.kwargs?.fields)
            ? (params.kwargs?.fields as string[])
            : [];
          fieldsRequested.push(fields);
          if (fields.includes('raw')) {
            throw new Error("Invalid field 'raw' on 'ir.attachment'");
          }
          return [
            {
              id: 10,
              name: 'Order - SO42.pdf',
              mimetype: 'application/pdf',
              datas: SAMPLE_PDF_BASE64,
              res_model: 'sale.order',
              res_id: 42,
            },
          ] as T;
        }
        default:
          throw new Error(`Unexpected call ${params.model}.${params.method}`);
      }
    };

    const invoice = await findOrderInvoiceAttachment(odooCall, 1, 'secret', 42);
    assert.equal(invoice?.attachment.name, 'Order - SO42.pdf');
    assert.equal(fieldsRequested.some((fields) => fields.includes('raw')), true);
    assert.equal(fieldsRequested.some((fields) => fields.includes('datas')), true);
  });
});
