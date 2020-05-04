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
const params = {
  fieldType: process.env.FIELD_TYPE,
  subDomain: process.env.SUB_DOMAIN
};
const crontInterval = process.env.CRON_SCHEDULE

async function getRecord(zone, params) {
  const records = await ovh.requestPromised('GET', `/domain/zone/${zone}/record`, params);

  if (records.length !== 1) {
    throw new Error('record not uniq or no record');
  }
  return await ovh.requestPromised('GET', `/domain/zone/${zone}/record/${records[0]}`, {});
}

cron.schedule(`${crontInterval}`, async () => {
  try {
    const [record, ip] = await Promise.all([getRecord(zone, params), publicIp.v4()]);

    if (record.target === ip) {
      console.log('Already good ip, do nothing')
      return
    }

    console.log(`Changing ip from ${record.target} to ${ip}`);

    const putRequest = await ovh.requestPromised('PUT', `/domain/zone/${zone}/record/${record.id}`, {
      target: ip
    });

  } catch (e) {
    console.error(e)
  }
}).start()

