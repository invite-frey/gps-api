const DEBUG = process.env.DEBUG ? process.env.DEBUG==='YES' : true
const mysql = require('mysql')
const maxRetries = 60
const messages = {start: "ACCStart", stop: "ACCStop"}
let pool = null

const query = (connection,sql,args) => {
    return new Promise( ( resolve, reject ) => {
        connection.query( sql, args, ( err, rows ) => {
            if ( err )
                return reject( err );
            resolve( rows );
        } );
    } );
}

const get = {
    unit: (unitId) => {
        return new Promise( (resolve,reject) => {
            if(pool){
                let result = null
                console.log('Have pool')
                pool.getConnection( async (err, connection) => {
                    if(err){
                        if(DEBUG) console.log("Database connection error: ", err.code);
                        reject(err)
                    }
                    const sql = `SELECT ts,utc,ip,gps_signal,message,gprmc_time,gprmc_status,gprmc_lat,gprmc_lat_loc,gprmc_long,gprmc_long_loc,gprmc_gs,gprmc_track,gprmc_date,gprmc_var,gprmc_var_sense,gprmc_mode,satellites,altitude,charge,charging,mcc,mnc,lac,cellid FROM data WHERE unit_id LIKE ${connection.escape("%"+unitId)} AND gps_signal='F' ORDER BY utc DESC LIMIT 1`
                    console.log('Executing sql')
                    result = await query(connection,sql)
                    console.log('Sql query finished',result)
                    const json = JSON.stringify(result)
                    connection.release()
                    resolve(JSON.parse(json))
                })
            }
        } );
    },
    waypoints: (unitId,dateRange) => {
        const {startDate,endDate} = dateRange

        return new Promise( (resolve,reject) => {
            if(pool){
                let result = null
                pool.getConnection( async (err, connection) => {
                    if(err){
                        if(DEBUG) console.log("Database connection error: ", err.code);
                        reject(err)
                    }
                    const sql = `SELECT ts,utc,ip,gps_signal,message,gprmc_time,gprmc_status,gprmc_lat,gprmc_lat_loc,gprmc_long,gprmc_long_loc,gprmc_gs,gprmc_track,gprmc_date,gprmc_var,gprmc_var_sense,gprmc_mode,satellites,altitude,charge,charging,mcc,mnc,lac,cellid FROM data WHERE WHERE utc BETWEEN ${connection.escape(startDate)} AND ${connection.escape(endDate)} AND unit_id LIKE ${connection.escape("%"+unitId)} AND gps_signal='F' ORDER BY utc DESC`
                    result = await query(connection,sql)
                    const json = JSON.stringify(result)
                    connection.release()
                    resolve(JSON.parse(json))
                })
            }
        } );
    },
    message: (unitId,message,dateRange) => {
        let {startDate,endDate} = dateRange
        return new Promise( (resolve,reject) => {
            if(pool){
                let result = null
                pool.getConnection( async (err, connection) => {
                    if(err){
                        if(DEBUG) console.log("Database connection error: ", err.code);
                        reject(err)
                    }
                    const sql = `SELECT utc,message FROM data WHERE utc BETWEEN ${connection.escape(startDate)} AND ${connection.escape(endDate)} AND unit_id LIKE ${connection.escape("%"+unitId)} AND gps_signal='F' AND message=${connection.escape(message)} ORDER BY utc DESC`
                 
                    result = await query(connection,sql)
                    const json = JSON.stringify(result)
                    connection.release()
                    resolve(JSON.parse(json))
                })
            }
        } );
    }
}

const mappedObject = (record,model) => {
    const mapped =  Object.keys(model.databaseMap).reduce( (result, key) => {
        result[ model.databaseMap[key] ] = record[key]
        return result
    }, {})

    mapped.gprmc_time = typeof mapped.gprmc_time === 'string' ? mapped.gprmc_time.substring(0,6) : ""
    mapped.unit_id = typeof mapped.unit_id === 'string' ? mapped.unit_id.replace("imei:","") : ""
    mapped.message = typeof mapped.message === 'string' ? mapped.message : ""

 
    if(typeof mapped.gprmc_time === 'string' && typeof mapped.gprmc_date === 'string'){
		const year = '20' + mapped.gprmc_date.substring(4)
		const month = mapped.gprmc_date.substring(2,4)
		const day = mapped.gprmc_date.substring(0,2)
		const hour = mapped.gprmc_time.substring(0,2)
		const minute =  mapped.gprmc_time.substring(2,4)
		const second =  mapped.gprmc_time.substring(4,6)
        mapped['utc'] = year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second
     
    }else{
        const utcString = (new Date()).toISOString().replace("T"," ").replace("Z"," ")
        mapped['utc'] = utcString
    }
    return mapped
}

const connect = (config) => {
    if(!config){
        throw "Unable to use null config for mysql."
    }

    pool = mysql.createPool(config)
}

const disconnect = () => {
    pool.end( (err) => {
        if(DEBUG) console.log('Mysql database disconnected.')
    })
}

const retryWrite = (records,model,retry,resolve,reject) => {
    setTimeout(() => {
        write(records,model,retry+1)
            .then(resolve)
            .catch(reject)
    },1000*(retry+1))
}

const write = (records,model,retry) => {

    return new Promise( (resolve,reject) => {
        if(pool){
            pool.getConnection( (err, connection) => {
                if(err){
                    console.log("Database connection error: ", err.code)
    
                    if(err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR' || err.code === 'POOL_CLOSED' ){
                        if(DEBUG) console.log(err.sqlMessage)
                        reject()
                        return
                    }
    
                    if(retry < maxRetries){
                        retryWrite(records,model,retry,resolve,reject)
                    }else{
                        if(DEBUG) console.log("Max retries exceeded. Unable to write following records to database: ", records)
                        reject()
                    }
                }else{
                    
                    //Create queries
                    const queryPromises = records.map( (record) => {
                        return query(connection,'INSERT INTO data SET ?', mappedObject(record,model))                  
                    })

                    Promise.all(queryPromises)
                        .then( () => {
                            connection.release()
                            if(DEBUG) console.log("Wrote " + records.length + " records  to the database.")
                            resolve(err)
                        })
                        .catch( (err) => {
                            connection.release()
                            if(DEBUG) console.log("Error: "+ err.code + " for: " + err.sql+" ...")
                            if( retry < maxRetries && err.code != 'ER_TRUNCATED_WRONG_VALUE' ){
                                if(DEBUG) console.log("...retrying.")
                                retryWrite(records,model,retry,resolve,reject)
                            }else{
                                console.log("...max retries exceeded or unrecoverable error. Bailing out.")
                                reject(err)
                            }
                        })
                }
            })
        }else{
            if( retry < maxRetries ){
                if(DEBUG) console.log("No connection pool. Retrying...")
                retryWrite(records,model,retry,resolve,reject)
            }else{
                reject()
            }
        }
    })
    
}



module.exports.connect = connect
module.exports.disconnect = disconnect
module.exports.write = (record,model) => write([record],model,0)
module.exports.get = get
module.exports.messages = messages
