const ovh = require('ovh')({
  endpoint: 'ovh-eu',
  appKey: 'QhINMgIEGOu4zjDS',
  appSecret: 'DsPDNJcOCgHkzHrYy1kpf9RoiRaPKn9y',
  consumerKey: 'Q0hdgiTigi6s4M9wtujc1l68zadXBuIr'
});
const publicIp = require('public-ip');

const zone = 'xontik.com';
const params = {
  fieldType: 'A',
  subDomain: '*'
};

async function getRecord(zone, params) {
  const records = await ovh.requestPromised('GET', `/domain/zone/${zone}/record`, params);

  if (records.length !== 1) {
    throw new Error('record not uniq or no record');
  }
  return await ovh.requestPromised('GET', `/domain/zone/${zone}/record/${records[0]}`, {});
}

(async () => {
  try {
    const [record, ip] = await Promise.all([getRecord(zone, params), publicIp.v4()]);

    if (record.target === ip) {
      console.log('Already good ip, do nothing')
      return
    }

    const putRequest = await ovh.requestPromised('PUT', `/domain/zone/${zone}/record/${record.id}`, {
      target: ip
    });

  } catch (e) {
    console.error(e)
  }


})()
