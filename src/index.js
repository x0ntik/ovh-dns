require('dotenv').config()

const ovh = require('ovh')({
  endpoint: 'ovh-eu',
  appKey: process.env.APP_KEY,
  appSecret: process.env.APP_SECRET,
  consumerKey: process.env.APP_CONSUMER_KEY,
});
const publicIp = require('public-ip');
const cron = require('node-cron');

const zone = process.env.ZONE_DNS;

const crontInterval = process.env.CRON_SCHEDULE
const subDomains = process.env.SUB_DOMAINS.split(',')
async function getRecord(zone, params) {
  const records = await ovh.requestPromised('GET', `/domain/zone/${zone}/record`, params);

  if (records.length !== 1) {
    throw new Error('record not uniq or no record');
  }
  return await ovh.requestPromised('GET', `/domain/zone/${zone}/record/${records[0]}`, {});
}

cron.schedule(`${crontInterval}`, async () => {
  for (const subdomain of subDomains) {
    try {
      const params = {
        fieldType: process.env.FIELD_TYPE,
        subDomain: subdomain
      };
      const [record, ip] = await Promise.all([getRecord(zone, params), publicIp.v4()]);
      console.log(ip)
      console.log(record)
      if (record.target === ip) {
        console.log('Already good ip, do nothing')
        continue;
      }

      console.log(`Changing ip from ${record.target} to ${ip}`);

      const putRequest = await ovh.requestPromised('PUT', `/domain/zone/${zone}/record/${record.id}`, {
        target: ip
      });

      const refresh = await ovh.requestPromised('POST', `/domain/zone/${zone}/refresh`);

    } catch (e) {
      console.error(e)
    }
  }
}).start()

