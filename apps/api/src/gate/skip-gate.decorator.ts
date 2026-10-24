import { SetMetadata } from '@nestjs/common';

export const SKIP_GATE = 'skipGate';

/** Exempts a route from the maintenance and minimum-version checks (health, public settings). */
export const SkipGate = () => SetMetadata(SKIP_GATE, true);
