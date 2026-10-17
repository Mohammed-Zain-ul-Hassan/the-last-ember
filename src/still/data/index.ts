import type { District } from '../sim/types';
import { GATE_WARD } from './gateWard';
import { MARKET } from './market';
import { TEMPLE } from './temple';
import { LIBRARY } from './library';
import { HEART_D } from './heart';

/** The five districts, in the order they are walked. */
export const DISTRICTS: District[] = [GATE_WARD, MARKET, TEMPLE, LIBRARY, HEART_D];
