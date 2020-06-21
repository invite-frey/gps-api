const DEBUG = process.env.DEBUG ? process.env.DEBUG==='YES' : true
const Influx = require('influx')
const escape = require('influx').escape
let connection = null
let tachometerTick = 30

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

function influxDate(data){
    
    if(typeof data.utc === 'string' && typeof data.position_utc === 'string'){
        const year = '20' + data.position_utc.substring(4)
		const month =  data.position_utc.substring(2,4)
		const day = data.position_utc.substring(0,2)
		const hour = data.utc.substring(0,2)
		const minute =  data.utc.substring(2,4)
        const second =  data.utc.substring(4,6)
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);   
    }else{
        return new Date()
    }

}

const connect = (config,dataInterval=30) => {
    if(!config){
        throw "Unable to use null config for influxdb."
    }

    tachometerTick = dataInterval

    connection = new Influx.InfluxDB(
        Object.assign({
            schema: [
                {
                    measurement: 'speed',
                    fields: { value: Influx.FieldType.FLOAT },
                    tags: ['unit','lat','long']
                },
                {
                    measurement: 'duration',
                    fields: { value: Influx.FieldType.INTEGER },
                    tags: ['unit','lat','long']
                }
            ]
        },config)
    )
}

const get = {
    units: async () => {
        const result = await connection.query("show tag values from speed with key=unit")
        const units = []

        for( key in result ){
            if(result[key].value){
                const startChar = result[key].value.indexOf(":")
                const unit = result[key].value.substring(startChar+1)
                if( unit !== 'undefined' && result[key].key === "unit" ){
                    units.push({id: unit})
                }
            }
        }    
        return units;
    },
    events: async (unitId,group="d",timezone="UTC",dateRange) => {
        let {startDate,endDate} = dateRange
        endDate = escape.stringLit(endDate)
        startDate = escape.stringLit(startDate)
        unitId = escape.measurement(unitId)
        group = escape.measurement(group)
        timezone = escape.stringLit(timezone)
        const query = `select sum(value) from "duration" where time > ${startDate} and time < ${endDate} and unit =~ /.*${unitId}/ group by time(1${group}) TZ(${timezone})`
        const result = await connection.query(query)
        return result;
    },
    distance: async (unitId,timezone="UTC",dateRange) => {
        let {startDate,endDate} = dateRange
        endDate = escape.stringLit(endDate)
        startDate = escape.stringLit(startDate)
        unitId = escape.measurement(unitId)
        timezone = escape.stringLit(timezone)
        const query = `select integral(value) / 3600 from "speed" where time > ${startDate} and time < ${endDate} and unit =~ /.*${unitId}/ TZ(${timezone})`
        console.log(query)
        const result = await connection.query(query)
        return result;
    }
}

const write = (records,model,retry) => {
    if( connection ){
        const filteredRecords = records.filter( (r) => {
            return isNumeric(r.gs)
        })
        return new Promise( (resolve, reject) => {
            if(connection){
                const queryPromises = filteredRecords.map( (record) => {
                    const duration = parseFloat(record.gs) > 2 ? tachometerTick : 0
                    const ts = influxDate(record)

                    return connection.writePoints(
                        [
                            {
                                measurement: 'speed',
                                fields: {value: record.gs},
                                tags: {unit: record.imei, lat: record.lat_loc + record.lat, long: record.long_loc + record.long},
                                timestamp: ts
                            },
                            {
                                measurement: 'duration',
                                fields: {value: duration},
                                tags: {unit: record.imei, lat: record.lat_loc + record.lat, long: record.long_loc + record.long},
                                timestamp: ts
                            }
                        ]
                    )
                })

                Promise.all(queryPromises)
                    .then( () => {
                        if(DEBUG) console.log(`Wrote ${filteredRecords.length} record(s) to influxdb.`)
                        resolve()
                    })
                    .catch( (err) => {
                        if(DEBUG) console.log("Error: "+ err.code + " while writing to influxdb.")
                        reject(err)
                    })
            }
        })
    }
}

const disconnect = () => {
    connection = null
}

module.exports.connect = connect
module.exports.disconnect = disconnect
module.exports.get = get
module.exports.write = (record,model) => write([record],model,0)