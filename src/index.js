
require('dotenv').config();

const ovh = require('ovh')({
  endpoint: 'ovh-eu',
  appKey: process.env.APP_KEY,
  appSecret: process.env.APP_SECRET,
  consumerKey: process.env.APP_CONSUMER_KEY,
});

const publicIp = require('public-ip');
const cron = require('node-cron');
const zones = require('./zones.json');

const {
  OPNSENSE_URL,
  OPNSENSE_KEY,
  OPNSENSE_SECRET,
  CRON_SCHEDULE,
  FIELD_TYPE = 'A',
} = process.env;

const FIBER_GATEWAY = 'WAN_DHCP';

let isRunning = false;

async function isFiberActive() {
  const credentials = Buffer.from(
    `${OPNSENSE_KEY}:${OPNSENSE_SECRET}`
  ).toString('base64');

  const response = await fetch(
    `${OPNSENSE_URL.replace(/\/$/, '')}/api/routing/settings/search_gateway`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `OPNsense API returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const fiber = data.rows?.find(
    (gateway) => gateway.name === FIBER_GATEWAY
  );

  if (!fiber) {
    throw new Error(
      `Gateway ${FIBER_GATEWAY} not found`
    );
  }

  console.log(
    `[OPNsense] ${FIBER_GATEWAY}: ` +
    `status=${fiber.status}, ` +
    `defaultgw=${fiber.defaultgw}, ` +
    `disabled=${fiber.disabled}`
  );

  return (
    fiber.disabled === false &&
    fiber.status === 'Online' &&
    fiber.defaultgw === true
  );
}

async function assertFiberActive() {
  if (!(await isFiberActive())) {
    throw new Error(
      'Fiber gateway is not active; DNS updates aborted'
    );
  }
}

async function getRecord(zone, params) {
  const path = `/domain/zone/${encodeURIComponent(zone)}/record`;

  const records = await ovh.requestPromised(
    'GET',
    path,
    params
  );

  if (records.length !== 1) {
    throw new Error(
      `Expected exactly one record for ` +
      `${params.subDomain}.${zone}, found ${records.length}`
    );
  }

  return ovh.requestPromised(
    'GET',
    `${path}/${records[0]}`
  );
}

async function updateZone(zone, ipv4) {
  console.log(`[${zone.name}] Starting DNS update`);

  let needsRefresh = false;
  let fiberUnavailable = false;

  for (const subdomain of zone.subDomains) {
    try {
      const record = await getRecord(zone.name, {
        fieldType: FIELD_TYPE,
        subDomain: subdomain,
      });

      if (record.target === ipv4) {
        console.log(
          `[${zone.name}] ${subdomain || '@'}: already ${ipv4}`
        );
        continue;
      }

      // Recheck immediately before changing OVH records.
      await assertFiberActive();

      console.log(
        `[${zone.name}] ${subdomain || '@'}: ` +
        `${record.target} -> ${ipv4}`
      );

      await ovh.requestPromised(
        'PUT',
        `/domain/zone/${encodeURIComponent(zone.name)}/record/${record.id}`,
        { target: ipv4 }
      );

      needsRefresh = true;
    } catch (error) {
      console.error(
        `[${zone.name}] ${subdomain || '@'}:`,
        error.message
      );

      // Do not continue updating records if the
      // gateway status is unavailable or fiber is down.
      try {
        await assertFiberActive();
      } catch (gatewayError) {
        fiberUnavailable = true;
        console.error(
          `[${zone.name}] Stopping updates:`,
          gatewayError.message
        );
        break;
      }
    }
  }

  // Refresh even if an earlier PUT succeeded before
  // the fiber went down.
  if (needsRefresh) {
    await ovh.requestPromised(
      'POST',
      `/domain/zone/${encodeURIComponent(zone.name)}/refresh`
    );

    console.log(`[${zone.name}] Zone refreshed`);
  }

  if (fiberUnavailable) {
    throw new Error(
      `Stopped ${zone.name}: fiber unavailable`
    );
  }
}

async function updateDns() {
  if (isRunning) {
    console.log(
      '[Cron] Previous execution still running, skipping'
    );
    return;
  }

  isRunning = true;

  try {
    console.log('[Cron] Starting DNS update');

    // Fail closed if OPNsense is unreachable or fiber
    // is not the selected, online gateway.
    await assertFiberActive();

    // Detect public IP once for all zones.
    const ipv4 = await publicIp.v4();

    console.log(`[Public IP] ${ipv4}`);

    // Detect a failover that occurred during IP lookup.
    await assertFiberActive();

    for (const zone of zones) {
      try {
        await updateZone(zone, ipv4);
      } catch (error) {
        console.error(
          `[${zone.name}] Update failed:`,
          error.message
        );

        // Stop processing other zones if fiber
        // is no longer available.
        try {
          await assertFiberActive();
        } catch {
          console.log(
            '[Cron] Fiber unavailable, stopping this run'
          );
          break;
        }
      }
    }

    console.log('[Cron] DNS update finished');
  } catch (error) {
    console.error(
      '[Cron] DNS update skipped:',
      error.message
    );
  } finally {
    isRunning = false;
  }
}

if (
  !OPNSENSE_URL ||
  !OPNSENSE_KEY ||
  !OPNSENSE_SECRET ||
  !CRON_SCHEDULE
) {
  throw new Error(
    'Missing required OPNsense or cron environment variables'
  );
}

if (!cron.validate(CRON_SCHEDULE)) {
  throw new Error(
    `Invalid CRON_SCHEDULE: ${CRON_SCHEDULE}`
  );
}

console.log(
  `[Cron] DNS updater scheduled: ${CRON_SCHEDULE}`
);

cron.schedule(CRON_SCHEDULE, updateDns);
