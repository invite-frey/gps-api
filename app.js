const express = require('express')
const bodyParser = require('body-parser')
const influx = require('./influx-database')
const mysql = require('./mysql-database')
const env = require('./env')
const app = express()
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')
const apiKeyMiddleware = require('./apikey.middleware')
const port = process.env.PORT || 1337;
const {verifyUnitId} = require('./verifyStrings')
const events = require('./events')
const getEvents = (id,timeZone="UTC",fromUtc=null,toUtc=null) => events.get(influx,mysql,id,timeZone,fromUtc,toUtc) 


/**
 * Setup request logging
 */
app.use(morgan("common"))

/**
 * Add support for POST endpoints
 */
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

/**
 * Activate CORS
 */
app.use(cors())

/**
 * Use Helmet for basic protection
 */

app.use(helmet())

/**
 * Require API Key for all access
 */

app.use(apiKeyMiddleware.apiKeyNeeded)

/**
 * Endpoint: Get a list of units.
 */
// app.get('/units', async (req, res) => {
//   try{
//     const units = await influx.get.units()
//     return res.json(units);
    
//   }catch(error){
//     return res.status(500).send(error.message)
//   }
    
// });

/**
 * Endpoint: gets the last recorded information for unit identified by 'id'
 */
app.get('/units/:id', async (req, res) => {
  try{
    const id = req.params.id
    if(verifyUnitId(id)){
      const unitData = await mysql.get.unit(id)
      if(unitData.length===1){
        return res.json(unitData[0])
      }else{
        return res.status(400).send(new Error("Ambiguous unit id."))
      }
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    return res.status(500).send(error.message)
  }
});

/**
 * Endpoint: Gets events for unit identified by 'id'. Expects a POST object in the form of an array containing time ranges to search in.
 * All times are expected to be UTC.
 * 
 * Example of POST json object:
 * 
 * {"ranges": [
 *     {"fromUtc" : "2019-09-22",
 *	    "toUtc" : "2019-09-25"},
 *	   {"fromUtc" : "2019-10-01",
 *	    "toUtc" : "2019-10-23"}
 * ]}
 */
app.post('/units/:id/events', async (req,res) => {
  console.log("User: ", req.apiUser)
  try{
    const {id} = req.params
    const {ranges,timeZone} = req.body
    console.log(req.body)

    if( !Array.isArray(ranges) ){
      return res.status(400).send({error: "POST path needs a set of ranges."})
    }

    if(!verifyUnitId(id)){
      return res.status(400).send({error: "Invalid id."})
    }
    
    const promises = ranges.map( async (range) => {
      const {fromUtc,toUtc} = range
      try{
        return await getEvents(id,"UTC", fromUtc, toUtc);
       
      }catch(error){
        if(error.stack) throw error;
        return {"error": error.message}
      }      
    }) 

    return res.json(await Promise.all(promises))
    
  }catch(error){
    return res.status(500).send(error.stack)
  }
})

/**
 * Endpoint: GET request for events for unit identified by 'id'. Returns events one month back in time by default.
 * A different time range can be set by providing the following url query parameters:
 * 
 * @param fromUtc Start of time range in UTC time. Time should be in format YYYY-DD-MM or full ISO time string.
 * @param toUtc End tome of range in UTC. Time should be in format YYYY-DD-MM or full ISO time string. If only date is given, the time range will end at the end of that day (before midnight next day).
 */
app.get('/units/:id/events', async (req,res) => {  
  const {id} = req.params
  const {fromUtc,toUtc} = req.query

  try{
    const results = await getEvents(id,"UTC",fromUtc,toUtc)
    return res.json(results)
    
  }catch(error){
    return res.status(400).send(error.message)
  }
})

/**
 * Endpoint: Get sum of time in minutes for a period.
 * 
 * @param period Valid periods are: day, hour, minute
 * @returns Json object containing array of objects containing:  
 * {
 *   "time": "2019-09-24T00:00:00.000Z",
 *   "sum": null || total minutes
 * },
 */
app.get('/units/:id/events/:period', async (req,res) => {
  
  try{
    const {id,period} = req.params
    let decodedPeriod = ""
    switch(period){
      case "day":
        decodedPeriod = "d"
        break;
      case "hour":
        decodedPeriod = "h"
        break;
      case "minute":
        decodedPeriod = "m"
        break
      default:
        return res.status(400).send("Invalid time period.");
    }
    if(verifyUnitId(id)){
      const events = await influx.get.events(id,decodedPeriod)
      return res.json(events)
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    return res.status(500).send(error.stack)
  }
})


/**
 * Start app.
 */
app.listen(port, () => {
    influx.connect(env.influx)
    mysql.connect(env.mysql)
    console.log(`App listening on port ${port}!`)
  }
);
