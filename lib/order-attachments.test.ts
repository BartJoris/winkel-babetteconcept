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
  type OrderAttachmentsOdooCall,
} from './order-attachments';

const SAMPLE_PDF_BASE64 =
  'JVBERi0xLjQKJcOkw7zDtsO4CjEgMCBvYmogPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago=';

type OrderAttachmentsOdooCallParams = {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
};

describe('order attachment helpers', () => {
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

    const buffer = attachmentToPdfBuffer({
      id: 1,
      name: 'Order.pdf',
      datas: SAMPLE_PDF_BASE64,
    });
    assert.ok(buffer);
    assert.equal(isValidPdfBuffer(buffer!), true);
  });

  it('reads attachments with bin_size disabled and searches invoices and pickings', async () => {
    const calls: Array<{ model: string; method: string; kwargs?: Record<string, unknown> }> =
      [];

    const odooCall: OrderAttachmentsOdooCall = async <T>(
      params: OrderAttachmentsOdooCallParams
    ) => {
      calls.push({
        model: params.model,
        method: params.method,
        kwargs: params.kwargs,
      });

      switch (`${params.model}:${params.method}`) {
        case 'ir.attachment:search_read':
          if (params.args[0]?.[1]?.[2] === 42) {
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
          if (params.args[0]?.[1]?.[2] === 900) {
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
        case 'ir.attachment:read':
          assert.deepEqual(params.kwargs?.context, { bin_size: false });
          return [
            {
              id: 10,
              name: 'Order - SO42.pdf',
              mimetype: 'application/pdf',
              datas: SAMPLE_PDF_BASE64,
              res_model: 'sale.order',
              res_id: 42,
            },
            {
              id: 11,
              name: 'Sendcloud label SO42.pdf',
              mimetype: 'application/pdf',
              datas: SAMPLE_PDF_BASE64,
              res_model: 'stock.picking',
              res_id: 900,
            },
          ] as T;
        default:
          throw new Error(`Unexpected call ${params.model}.${params.method}`);
      }
    };

    const attachments = await collectOrderAttachments(odooCall, 1, 'secret', 42);
    assert.equal(attachments.length, 2);
    assert.ok(
      calls.some(
        (call) => call.model === 'ir.attachment' && call.method === 'read' && call.kwargs?.context
      )
    );

    const invoice = await findOrderInvoiceAttachment(odooCall, 1, 'secret', 42);
    assert.equal(invoice?.attachment.name, 'Order - SO42.pdf');

    const label = await findOrderShippingLabelAttachment(odooCall, 1, 'secret', 42);
    assert.equal(label?.attachment.name, 'Sendcloud label SO42.pdf');
  });
});
