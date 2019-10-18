const express = require('express')
const bodyParser = require('body-parser')
const influx = require('./influx-database')
const mysql = require('./mysql-database')
const env = require('./env')
const app = express();
const port = process.env.PORT || 1337;

const verifyUnitId = (id) => {
  return typeof id === 'string' && id.length > 10;
}

const verifyStartMessageDateConditions = (messageDate,eventDate,oppositeEventDate,bufferDate) => messageDate < eventDate && (oppositeEventDate === null || messageDate > oppositeEventDate) && messageDate > bufferDate
const verifyEndMessageDateConditions = (messageDate,eventDate,oppositeEventDate,bufferDate) => messageDate > eventDate && (oppositeEventDate === null || messageDate < oppositeEventDate) && messageDate < bufferDate

const messageReducer = ({newEvents,remainingMessages}, e, messageType, dateConditionsVerify) => {
  const oppositeMessageType = messageType === "start" ? "end" : "start"
  const prevEvent = newEvents.length > 0 ? newEvents[newEvents.length-1] : null
  const allowedBufferDate = new Date(e[messageType]).setMinutes(e[messageType].getMinutes()-30)
  const eDateEnd = prevEvent!==null ? new Date(prevEvent[oppositeMessageType]) : null
  
  const earlierMessages = remainingMessages
    .filter( m => {
      const mDate = new Date(m.utc)
      return dateConditionsVerify(mDate,e[messageType],eDateEnd,allowedBufferDate)
      //return mDate < e[messageType] && (eDateEnd === null || mDate > eDateEnd) && mDate > allowedBufferDate;
    })

  
  let nextEvent = {}; nextEvent[`engineRun${messageType}`] = null; nextEvent = {...nextEvent,...e}
  const nextEvents = [...newEvents,nextEvent]
  if( earlierMessages.length>0 ){
      nextEvent[`engineRun${messageType}`] = earlierMessages[earlierMessages.length-1].utc
      remainingMessages = remainingMessages.filter( m =>  m.utc !== nextEvent[`engineRun${messageType}`] )
  }

  return( {newEvents: nextEvents, remainingMessages: remainingMessages.slice()})
}

const startMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"start",verifyStartMessageDateConditions)
const stopMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"end",verifyEndMessageDateConditions)  



app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.get('/units', async (req, res) => {
  try{
    const units = await influx.get.units()
    return res.json(units);
    
  }catch(error){
    return res.status(500).send(error.message)
  }
    
});

app.get('/unit/:id', async (req, res) => {
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

app.get('/unit/:id/events', async (req,res) => {
  
  try{
    const {id,period} = req.params
    if(verifyUnitId(id)){
      const timeEvents = await influx.get.events(id,"m")
      let startMessages = await mysql.get.message(id,mysql.messages.start)
      const stopMessages = await mysql.get.message(id,mysql.messages.stop)

      let event = {}
      let events = []

      for( key in timeEvents ){
        const tSum = timeEvents[key].sum || 0
        if(tSum>0 && typeof event.start==='undefined'){
          event.start = timeEvents[key].time
        }else if(tSum<60 && typeof event.start !== 'undefined'){
          event.end = timeEvents[key].time
          events.push(event)
          event = {}
        }
      }
      
      const eventsWithEngineStart = events.reduce(startMessageReducer, {newEvents:[],remainingMessages:[...startMessages]})

      //console.log(events)
      return res.json(eventsWithEngineStart)
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    return res.status(500).send(error.stack)
  }
})

app.get('/unit/:id/events/:period', async (req,res) => {
  
  try{
    const {id,period} = req.params
    if(verifyUnitId(id)){
      const events = await influx.get.events(id,period)
      return res.json(events)
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    return res.status(500).send(error.stack)
  }
})

app.listen(port, () => {
    influx.connect(env.influx)
    mysql.connect(env.mysql)
    console.log(`App listening on port ${port}!`)
  }
);
