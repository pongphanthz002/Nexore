import QRCode from 'qrcode';

export async function generateQRCode(data: string): Promise<string> {
  try {
    const qrDataURL = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return qrDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export function encodeHubQR(url: string, key: string): string {
  const payload = `url::${key}`;
  return Buffer.from(payload).toString('base64');
}

export function decodeHubQR(encoded: string): { url: string; key: string } | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [url, key] = decoded.split('::');
    if (url && key) {
      return { url, key };
    }
    return null;
  } catch (error) {
    console.error('Error decoding QR:', error);
    return null;
  }
}
