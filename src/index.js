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

const crontInterval = process.env.CRON_SCHEDULE;
async function getRecord(zone, params) {
  const records = await ovh.requestPromised(
    'GET',
    encodeURI(`/domain/zone/${zone}/record`),
    params
  );

  if (records.length !== 1) {
    throw new Error(
      `record not uniq or no record ${zone} dom ${params.subDomain}`
    );
  }
  return await ovh.requestPromised(
    'GET',
    encodeURI(`/domain/zone/${zone}/record/${records[0]}`),
    {}
  );
}

for (const zone of zones) {
  console.log(`Start for ${zone.name}`);
  cron
    .schedule(`${crontInterval}`, async () => {
      for (const subdomain of zone.subDomains) {
        console.log(`Start for ${subdomain} of ${zone.name}`);
        try {
          const params = {
            fieldType: process.env.FIELD_TYPE,
            subDomain: subdomain,
          };
          const [record, ip] = await Promise.all([
            getRecord(zone.name, params),
            publicIp.v4(),
          ]);
          console.log(`Subdomain : -->${subdomain}<--`);
          if (record.target === ip) {
            console.log(`Already good ip do nothing`);
            continue;
          }

          console.log(`Changing ip from ${record.target} to ${ip}`);

          const putRequest = await ovh.requestPromised(
            'PUT',
            encodeURI(`/domain/zone/${zone.name}/record/${record.id}`),
            {
              target: ip,
            }
          );

          const refresh = await ovh.requestPromised(
            'POST',
            encodeURI(`/domain/zone/${zone.name}/refresh`)
          );
        } catch (e) {
          console.error(e);
        }
      }
    })
    .start();
}
