import { Temporal } from '@js-temporal/polyfill';
import path from 'path';
import { Color, Font, GpioMapping, LedMatrix } from 'rpi-led-matrix';
import { Octopus, Tariff, intervalContains } from './octopus';
import { Reloader } from './reloader';

interface ValueColor {
  value: number;
  color: Color | number;
}

const COLORS: ValueColor[] = [
  { value: 0, color: 0x0000ff },
  { value: 20, color: 0x00ff00 },
  { value: 40, color: 0xffff00 },
  { value: 60, color: 0xff7f50 },
  { value: 100, color: 0xff0000 },
];

function color(value: number) {
  return COLORS.find((vc) => value <= vc.value)!.color;
}

export class Display {
  // Load the font before creating the LedMatrix, as doing so drops root privileges which renders the file unreadable. Guess how long that took to work out.
  private readonly font = loadFont('5x8');
  private readonly matrix = new LedMatrix(
    {
      ...LedMatrix.defaultMatrixOptions(),
      rows: 32,
      cols: 64,
      chainLength: 1,
      hardwareMapping: GpioMapping.Regular,
      pwmLsbNanoseconds: 250,
      limitRefreshRateHz: 100,
      pwmBits: 8,
    },
    {
      ...LedMatrix.defaultRuntimeOptions(),
      gpioSlowdown: 1,
    },
  );
  private readonly octopus = new Octopus();
  private tariff: Tariff[] | undefined = undefined;
  private readonly reloader: Reloader<Promise<Tariff[]>, Temporal.PlainDateTime> = new Reloader<
    Promise<Tariff[]>,
    Temporal.PlainDateTime
  >(
    async (_, cancelled) => {
      while (!cancelled()) {
        try {
          return await this.octopus.getTariff();
        } catch (e) {
          console.log('Failed to load tariffs', e);
          await new Promise((resolve) => setTimeout(resolve, 60_000));
        }
      }
      throw new Error('Cancelled loading tariffs.');
    },
    () => Temporal.Now.plainDateTimeISO().round({ smallestUnit: 'hour', roundingMode: 'trunc' }),
    (a, b) => Temporal.PlainDateTime.compare(a, b) == 0,
  );

  constructor() {
    this.matrix.brightness(30).font(this.font);

    this.matrix.afterSync((mat, dt, t) => {
      this.reloader.get().then((tariff) => {
        this.tariff = tariff;
      });

      if (this.tariff) {
        const now = Temporal.Now.instant();
        mat.clear();
        const values = this.tariff.map((t) => t.rate);
        const min = Math.min(...values);
        const max = Math.max(...values);

        for (let x = 0; x < this.tariff.length; ++x) {
          const tariff = this.tariff[x];

          if (intervalContains(tariff.interval, now)) {
            mat
              .fgColor(0x404040)
              .drawLine(x, 0, x, mat.height())
              .fgColor(0xffffff)
              .drawText(('' + Math.round(tariff.rate)).padStart(3), 48, 12);
          }

          const graphOffset = 1;
          const graphHeight = this.matrix.height() - 2 * graphOffset;

          const zeroPoint = Math.max(min, 0);

          mat
            .fgColor(color(tariff.rate))
            .drawLine(
              x,
              mat.height() -
                graphOffset -
                1 -
                Math.round(((zeroPoint - min) / (max - min)) * graphHeight),
              x,
              mat.height() -
                graphOffset -
                1 -
                Math.round(((tariff.rate - min) / (max - min)) * (graphHeight - 1)),
            );
        }

        mat
          .fgColor(0x808080)
          .drawText(('' + Math.round(max)).padStart(3), 48, 2)
          .drawText(('' + Math.round(min)).padStart(3), 48, 22);
      }
      setTimeout(() => this.matrix.sync(), 1000);
    });

    this.matrix.sync();
  }
}

function loadFont(name: string) {
  const moduleDir = path.join(path.dirname(require.resolve('rpi-led-matrix')), '..');
  return new Font(name, `${moduleDir}/fonts/${name}.bdf`);
}
