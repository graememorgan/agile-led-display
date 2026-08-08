import { Temporal } from '@js-temporal/polyfill';
import assert from 'assert';
import fetch from 'node-fetch';
import createClient from 'openapi-fetch';
import type { paths } from './octopus-schema';

const BASE_URL = 'https://api.octopus.energy/';
const OCTOPUS_API_KEY = process.env.OCTOPUS_API_KEY || '';
const ACCOUNT_ID = process.env.ACCOUNT_ID || '';

const HEADERS = {
  Authorization: 'Basic ' + btoa(OCTOPUS_API_KEY + ':password'),
};

export interface Interval {
  /** Lower, inclusive. */
  lower: Temporal.Instant;
  /** Upper, exclusive. */
  upper: Temporal.Instant;
}

export function intervalContains(interval: Interval, instant: Temporal.Instant) {
  return (
    Temporal.Instant.compare(interval.lower, instant) <= 0 &&
    Temporal.Instant.compare(instant, interval.upper) < 0
  );
}

export interface Tariff {
  interval: Interval;
  /** Rate per kWh, in pence. */
  rate: number;
}

export class Octopus {
  private readonly client = createClient<paths>({
    baseUrl: BASE_URL,
    headers: HEADERS,
  });

  /** Loads the account, returning the mpan for the electricity meter and the tariff code. */
  async getAccount(now: Temporal.Instant) {
    const response = await fetch(BASE_URL + '/v1/accounts/' + ACCOUNT_ID, {
      headers: HEADERS,
    });
    const json = (await response.json()) as any;
    assert(json.properties.length === 1);

    const property = json.properties[0];
    assert(property.electricity_meter_points.length === 1);
    const emp = property.electricity_meter_points[0];

    const activeAgreement = (emp.agreements as any[]).find((a) => {
      const from = Temporal.Instant.from(a.valid_from as string);
      const to = Temporal.Instant.from(a.valid_to as string);
      return Temporal.Instant.compare(from, now) <= 0 && Temporal.Instant.compare(now, to) < 0;
    });
    return [emp.mpan as string, activeAgreement?.tariff_code as string | undefined];
  }

  async getTariff(): Promise<Tariff[]> {
    const now = Temporal.Now.instant();
    const zone = Temporal.Now.timeZoneId();

    const [mpan, tariffCode] = await this.getAccount(now);
    console.log(`Loaded account, and got: MPAN: ${mpan}, tariffCode: ${tariffCode}`);
    if (tariffCode === undefined) {
      return [];
    }

    const periodFrom = now.toZonedDateTimeISO(zone).startOfDay();
    const periodTo = now.toZonedDateTimeISO(zone).add({ days: 1 }).startOfDay();

    const { data } = await this.client.GET(
      '/v1/products/{product_code}/electricity-tariffs/{tariff_code}/standard-unit-rates/',
      {
        params: {
          path: {
            product_code: tariffToProduct(tariffCode),
            tariff_code: tariffCode,
          },
          query: {
            period_from: periodFrom.toString({
              timeZoneName: 'never',
              calendarName: 'never',
            }),
            period_to: periodTo.toString({
              timeZoneName: 'never',
              calendarName: 'never',
            }),
            page_size: 100,
          },
        },
      },
    );
    if (data === undefined) {
      return [];
    }
    const rates = data.results.map((r) => ({
      interval: {
        lower: Temporal.Instant.from(r.valid_from!),
        upper: Temporal.Instant.from(r.valid_to!),
      },
      rate: r.value_inc_vat,
    }));
    rates.sort((a, b) => Temporal.Instant.compare(a.interval.lower, b.interval.lower));
    return rates;
  }
}

/** This seems wildly wrong. I can't see how to get product codes from the API though. */
function tariffToProduct(tariff: string) {
  const components = tariff.split('-');
  return components.slice(2, components.length - 1).join('-');
}
