import * as chai from 'chai';
import http from 'http';
import {
  validateToken,
  fetchServiceCatalog,
  fetchLayerMetadata,
  queryLayer,
} from '../lib/arcgis-core.js';
import { ArcqError } from '../lib/errors.js';

const { expect } = chai;

describe('arcgis-core', () => {
  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let lastRequest: http.IncomingMessage | null;
  let lastBody: URLSearchParams | null;

  function respond(data: unknown) {
    handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
      lastRequest = req;
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        lastBody = new URLSearchParams(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      });
    };
  }

  before(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    lastRequest = null;
    lastBody = null;
  });

  // ---------------------------------------------------------------------------

  describe('validateToken', () => {
    it('resolves when the response has no error', async () => {
      respond({ name: 'My Layer' });
      await validateToken(baseUrl, 'tok'); // throws on failure
    });

    it('throws with the server error message when response has an error', async () => {
      respond({ error: { message: 'Invalid or missing token.' } });
      let thrown;
      try {
        await validateToken(baseUrl, 'bad-tok');
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(Error);
      expect((thrown as Error).message).to.equal('Invalid or missing token.');
    });

    it('sends f=json and the token as a form-encoded POST body', async () => {
      respond({});
      await validateToken(baseUrl, 'my-token');
      expect(lastRequest!.method).to.equal('POST');
      expect(lastRequest!.headers['content-type']).to.match(
        /application\/x-www-form-urlencoded/
      );
      expect(lastBody!.get('f')).to.equal('json');
      expect(lastBody!.get('token')).to.equal('my-token');
    });

    it('maps error code 498 to the exit-2 token message', async () => {
      respond({ error: { code: 498, message: 'Invalid token.' } });
      let thrown;
      try {
        await validateToken(baseUrl, 'bad-tok');
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect((thrown as ArcqError).message).to.include('arcq token set');
    });
  });

  // ---------------------------------------------------------------------------

  describe('fetchServiceCatalog', () => {
    it('returns mapped layers', async () => {
      respond({ layers: [{ id: 0, name: 'Parcels', type: 'Feature Layer' }] });
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result).to.deep.equal([
        { id: 0, name: 'Parcels', type: 'Feature Layer', url: `${baseUrl}/0` },
      ]);
    });

    it('returns mapped tables', async () => {
      respond({ tables: [{ id: 1, name: 'Metadata', type: 'Table' }] });
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result).to.deep.equal([
        { id: 1, name: 'Metadata', type: 'Table', url: `${baseUrl}/1` },
      ]);
    });

    it('combines layers and tables into a single array', async () => {
      respond({
        layers: [{ id: 0, name: 'Parcels', type: 'Feature Layer' }],
        tables: [{ id: 1, name: 'Metadata', type: 'Table' }],
      });
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result).to.have.length(2);
      expect(result.map((r) => r.name)).to.deep.equal(['Parcels', 'Metadata']);
    });

    it('defaults type to "layer" when absent', async () => {
      respond({ layers: [{ id: 0, name: 'Parcels' }] });
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result[0]!.type).to.equal('layer');
    });

    it('constructs each url as serviceUrl/id', async () => {
      respond({ layers: [{ id: 5, name: 'Roads' }] });
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result[0]!.url).to.equal(`${baseUrl}/5`);
    });

    it('returns an empty array when layers and tables are absent', async () => {
      respond({});
      const result = await fetchServiceCatalog(baseUrl, null);
      expect(result).to.deep.equal([]);
    });

    it('sends f=json and the token in a form-encoded POST body', async () => {
      respond({});
      await fetchServiceCatalog(baseUrl, 'catalog-token');
      expect(lastRequest!.method).to.equal('POST');
      expect(lastBody!.get('f')).to.equal('json');
      expect(lastBody!.get('token')).to.equal('catalog-token');
    });

    it('omits a null token from the POST body', async () => {
      respond({});
      await fetchServiceCatalog(baseUrl, null);
      expect(lastBody!.has('token')).to.equal(false);
      expect(lastBody!.get('f')).to.equal('json');
    });

    it('throws an ArcqError when the response has an error', async () => {
      respond({ error: { code: 400, message: 'Invalid URL' } });
      let thrown;
      try {
        await fetchServiceCatalog(baseUrl, null);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
      expect((thrown as ArcqError).message).to.include('Invalid URL');
    });
  });

  // ---------------------------------------------------------------------------

  describe('fetchLayerMetadata', () => {
    it('returns fields stripped to name, type, alias, and length', async () => {
      respond({
        fields: [
          {
            name: 'OBJECTID',
            type: 'esriFieldTypeOID',
            alias: 'OBJECTID',
            domain: null,
            editable: false,
          },
          {
            name: 'NAME',
            type: 'esriFieldTypeString',
            alias: 'Name',
            length: 128,
          },
        ],
      });
      const result = await fetchLayerMetadata(baseUrl, null);
      expect(result).to.deep.equal([
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        {
          name: 'NAME',
          type: 'esriFieldTypeString',
          alias: 'Name',
          length: 128,
        },
      ]);
    });

    it('returns an empty array when the response has no fields', async () => {
      respond({});
      expect(await fetchLayerMetadata(baseUrl, null)).to.deep.equal([]);
    });

    it('sends f=json and the token in a form-encoded POST body', async () => {
      respond({ fields: [] });
      await fetchLayerMetadata(baseUrl, 'meta-token');
      expect(lastRequest!.method).to.equal('POST');
      expect(lastBody!.get('f')).to.equal('json');
      expect(lastBody!.get('token')).to.equal('meta-token');
    });

    it('throws an ArcqError when the response has an error', async () => {
      respond({ error: { code: 400, message: 'Invalid URL' } });
      let thrown;
      try {
        await fetchLayerMetadata(baseUrl, null);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
    });

    it('maps error code 499 to the exit-2 token message', async () => {
      respond({ error: { code: 499, message: 'Token Required' } });
      let thrown;
      try {
        await fetchLayerMetadata(baseUrl, null);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
    });
  });

  // ---------------------------------------------------------------------------

  describe('queryLayer', () => {
    it('makes a POST request to layerUrl/query', async () => {
      respond({ features: [] });
      await queryLayer(baseUrl, { where: '1=1', f: 'json' });
      expect(lastRequest!.method).to.equal('POST');
      expect(lastRequest!.url).to.equal('/query');
    });

    it('passes all params in the POST body', async () => {
      respond({ features: [] });
      await queryLayer(baseUrl, {
        where: 'AREA > 100',
        f: 'json',
        outFields: '*',
      });
      expect(lastBody!.get('where')).to.equal('AREA > 100');
      expect(lastBody!.get('f')).to.equal('json');
      expect(lastBody!.get('outFields')).to.equal('*');
    });

    it('omits a null token from the POST body', async () => {
      respond({ features: [] });
      await queryLayer(baseUrl, { where: '1=1', f: 'json', token: null });
      expect(lastBody!.has('token')).to.equal(false);
    });

    it('returns the response data', async () => {
      const payload = { features: [{ attributes: { ID: 1 } }] };
      respond(payload);
      const result = await queryLayer(baseUrl, { where: '1=1', f: 'json' });
      expect(result).to.deep.equal(payload);
    });

    it('throws an ArcqError with the server message on a response error', async () => {
      respond({
        error: { code: 400, message: 'Unable to complete operation.' },
      });
      let thrown;
      try {
        await queryLayer(baseUrl, { where: 'BAD = "SYNTAX"', f: 'json' });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
      expect((thrown as ArcqError).message).to.equal(
        'ArcGIS error 400: Unable to complete operation.'
      );
    });

    it('maps error code 498 to the exit-2 token message', async () => {
      respond({ error: { code: 498, message: 'Invalid token.' } });
      let thrown;
      try {
        await queryLayer(baseUrl, { where: '1=1', f: 'json' });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect((thrown as ArcqError).message).to.include('arcq token set');
    });

    it('maps error code 499 to the exit-2 token message', async () => {
      respond({ error: { code: 499, message: 'Token Required' } });
      let thrown;
      try {
        await queryLayer(baseUrl, { where: '1=1', f: 'json' });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
    });
  });
});
