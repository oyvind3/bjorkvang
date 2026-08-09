/**
 * Shared invoice builder for final invoices (sluttfaktura)
 * This module contains all the logic for calculating and building final invoice data.
 * It is used by:
 * - sendFinalInvoice (backend) - to send invoice via email/Vipps
 * - getFinalInvoice (backend) - to retrieve invoice data for viewing
 * - previewFinalInvoice (frontend) - to preview before sending
 */

const escapeHtml = (str) => String(str || '').replace(/[&<>\"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);

/**
 * Build final invoice data from booking and options
 * @param {Object} booking - The booking object from Cosmos DB
 * @param {Object} options - Invoice options
 * @param {number} options.cleaningFeeNOK - Cleaning fee (default 1000)
 * @param {Array} options.extraItems - Extra invoice items [{description, amountNOK}]
 * @param {number|null} options.minnesamvaerActualCount - Actual guest count for minnesamvær
 * @param {number} options.minnesamvaerRate - Rate per person for minnesamvær (default 30)
 * @param {Date} [options.dueDate] - Due date (default: 14 days from now)
 * @returns {Object} Invoice data object
 */
function buildFinalInvoice(booking, options = {}) {
    const cleaningFeeNOK = (typeof options.cleaningFeeNOK === 'number' && options.cleaningFeeNOK >= 0)
        ? options.cleaningFeeNOK
        : 1000;

    const extraItems = Array.isArray(options.extraItems) ? options.extraItems : [];

    const minnesamvaerActualCount = (typeof options.minnesamvaerActualCount === 'number' && options.minnesamvaerActualCount > 0)
        ? Math.floor(options.minnesamvaerActualCount)
        : null;

    const minnesamvaerRate = (typeof options.minnesamvaerRate === 'number' && options.minnesamvaerRate >= 0)
        ? options.minnesamvaerRate
        : 30;

    const dueDate = options.dueDate instanceof Date
        ? options.dueDate
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const depositNOK = booking.depositAmount || 0;

    // Calculate base total (package cost or per-person for minnesamvær)
    const baseTotalNOK = (minnesamvaerActualCount !== null)
        ? minnesamvaerActualCount * minnesamvaerRate
        : (booking.totalAmount || depositNOK * 2);

    const extrasTotal = extraItems.reduce((sum, item) => sum + (item.amountNOK || 0), 0);
    const grandTotalNOK = baseTotalNOK + cleaningFeeNOK + extrasTotal;
    const remainingNOK = grandTotalNOK - depositNOK;

    const paymentMethod = booking.paymentMethod || 'bank';
    const bankAccount = process.env.BANK_ACCOUNT || '1822.40.12345';
    const spaces = Array.isArray(booking.spaces) ? booking.spaces.join(', ') : (booking.spaces || '');
    const services = Array.isArray(booking.services) ? booking.services.join(', ') : (booking.services || '');

    // Build line items
    const lineItems = [];

    // Original package cost (or per-person for Minnesamvær)
    if (minnesamvaerActualCount !== null) {
        lineItems.push({
            description: `Minnesamvær – ${minnesamvaerActualCount} gjester × kr ${minnesamvaerRate.toLocaleString('nb-NO')}/pers`,
            amountNOK: baseTotalNOK,
            type: 'base'
        });
    } else if (spaces) {
        lineItems.push({
            description: `Lokale – ${spaces}`,
            amountNOK: baseTotalNOK,
            type: 'base'
        });
    }

    // Original services (included in base price – just informational)
    if (services) {
        lineItems.push({
            description: `Inkluderte tillegg – ${services}`,
            amountNOK: null,
            type: 'info'
        });
    }

    // Mandatory cleaning fee
    lineItems.push({
        description: 'Vask / Rengjøring (obligatorisk)',
        amountNOK: cleaningFeeNOK,
        type: 'extra'
    });

    // Extra charges added by admin
    for (const item of extraItems) {
        lineItems.push({
            description: item.description,
            amountNOK: item.amountNOK,
            type: 'extra'
        });
    }

    // Deposit already paid
    lineItems.push({
        description: '− Forhåndsbetaling allerede betalt',
        amountNOK: -depositNOK,
        type: 'deduction'
    });

    const dueDateStr = dueDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

    return {
        lineItems,
        baseTotalNOK,
        grandTotalNOK,
        depositNOK,
        remainingNOK,
        dueDate,
        dueDateStr,
        paymentMethod,
        bankAccount,
        cleaningFeeNOK,
        minnesamvaerActualCount,
        minnesamvaerRate,
        extraItems,
        isMinnesamvaer: minnesamvaerActualCount !== null
    };
}

/**
 * Generate HTML table for invoice email
 * @param {Object} invoiceData - Result from buildFinalInvoice
 * @returns {string} HTML table string
 */
function generateInvoiceTableHtml(invoiceData) {
    const { lineItems, grandTotalNOK, remainingNOK } = invoiceData;

    const itemRowsHtml = lineItems.map(row => {
        let colorStyle = '';
        if (row.type === 'extra') colorStyle = 'color:#b45309;';
        else if (row.type === 'deduction') colorStyle = 'color:#059669;';
        else if (row.type === 'info') colorStyle = 'color:#6b7280;';

        return `
            <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:8px 0;${colorStyle}">${escapeHtml(row.description)}</td>
                <td style="padding:8px 0;text-align:right;${colorStyle}">
                    ${row.amountNOK !== null ? `kr ${row.amountNOK.toLocaleString('nb-NO')}` : '(inkludert)'}
                </td>
            </tr>`;
    }).join('');

    return `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
            <tr style="border-bottom:2px solid #e5e7eb;font-weight:600;">
                <td style="padding:8px 0;">Beskrivelse</td>
                <td style="padding:8px 0;text-align:right;">Beløp</td>
            </tr>
            ${itemRowsHtml}
            <tr style="border-top:2px solid #e5e7eb;">
                <td style="padding:10px 0;font-weight:600;">Totalt for leieforholdet</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;">kr ${grandTotalNOK.toLocaleString('nb-NO')}</td>
            </tr>
            <tr>
                <td style="padding:14px 0 0;font-weight:bold;font-size:18px;">Gjenstående å betale</td>
                <td style="padding:14px 0 0;text-align:right;font-weight:bold;font-size:18px;">kr ${remainingNOK.toLocaleString('nb-NO')}</td>
            </tr>
        </table>`;
}

/**
 * Generate plain text version of invoice
 * @param {Object} invoiceData - Result from buildFinalInvoice
 * @returns {string} Plain text string
 */
function generateInvoiceText(invoiceData) {
    const { lineItems, grandTotalNOK, remainingNOK } = invoiceData;

    return lineItems.map(row =>
        `${row.description}: ${row.amountNOK !== null ? 'kr ' + row.amountNOK.toLocaleString('nb-NO') : '(inkludert)'}`
    ).join('\n') + `\nTotalt for leieforholdet: kr ${grandTotalNOK.toLocaleString('nb-NO')}\nGjenstående å betale: kr ${remainingNOK.toLocaleString('nb-NO')}`;
}

module.exports = {
    buildFinalInvoice,
    generateInvoiceTableHtml,
    generateInvoiceText,
    escapeHtml
};
