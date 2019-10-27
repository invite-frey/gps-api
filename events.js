
const dateRange = require('./daterange')
const {verifyDateString,verifiedDateStringOrNull} = require('./verifyStrings')
const capitalize = string =>  typeof string === 'string' && string.length>0 ? string.charAt(0).toUpperCase() + string.slice(1) : string
const verifyStartMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate < eventDate && (oppositeEventDate === null || messageDate > oppositeEventDate) && messageDate > new Date(eventDate).setMinutes(eventDate.getMinutes()-30)
const verifyEndMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate > eventDate && (oppositeEventDate === null || messageDate < oppositeEventDate) && messageDate < new Date(eventDate).setMinutes(eventDate.getMinutes()+30)

const messageReducer = ({newEvents,remainingMessages}, e, messageType, dateConditionsVerify) => {
  const oppositeMessageType = messageType === "start" ? "end" : "start"
  const prevEvent = newEvents.length > 0 ? newEvents[newEvents.length-1] : null
  const eDateEnd = prevEvent!==null ? new Date(prevEvent[oppositeMessageType]) : null

  const earlierMessages = remainingMessages
    .filter( m =>  dateConditionsVerify(new Date(m.utc),e[messageType],eDateEnd) )

  let nextEvent = {}; nextEvent[`engineRun${capitalize(messageType)}`] = null; nextEvent = {...nextEvent,...e}
  const nextEvents = [...newEvents,nextEvent]
  if( earlierMessages.length>0 ){
      nextEvent[`engineRun${capitalize(messageType)}`] = earlierMessages[earlierMessages.length-1].utc
      remainingMessages = remainingMessages.filter( m =>  m.utc !== nextEvent[`engineRun${capitalize(messageType)}`] )
  }

  return( {newEvents: nextEvents, remainingMessages: remainingMessages.slice()})
}
const startMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"start",verifyStartMessageDateConditions)
const stopMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"end",verifyEndMessageDateConditions)  


const getEvents = async (timedata,sqldata,id,timeZone="UTC",fromUtc=null,toUtc=null) => {
  fromUtc = verifiedDateStringOrNull(fromUtc)
  toUtc = verifiedDateStringOrNull(toUtc)

  if( (!fromUtc && toUtc) || (fromUtc && !toUtc) ){
    throw new Error(`Only received ${fromUtc ? `fromUtc '${fromUtc}'` : `toUtc '${toUtc}'`}. If 'fromUtc' or 'toUtc' query parameter is given both must be given.`)
  }
  if( fromUtc && toUtc && !(verifyDateString(fromUtc) && verifyDateString(toUtc))){
    throw new Error({error: `fromUtc '${fromUtc}' or toUtc '${toUtc}' invalid format.`})
  }
  
  if(toUtc && toUtc.length < 11){
    const toUtcDate = new Date(toUtc)
    toUtcDate.setDate(toUtcDate.getDate() + 1)
    toUtc = toUtcDate.toISOString()
  }

  const startDate = fromUtc ? new Date(fromUtc).toISOString() : null
  const endDate = toUtc ? new Date(toUtc).toISOString() : null
  const range = dateRange(startDate,endDate)
  console.log("range:",range)
  const timeEvents = await timedata.get.events(id,"m",timeZone,range)
  const startMessages = await sqldata.get.message(id,sqldata.messages.start,range)
  const stopMessages = await sqldata.get.message(id,sqldata.messages.stop,range)

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
  const eventsWithEngineStop = eventsWithEngineStart.newEvents.reverse().reduce(stopMessageReducer, {newEvents:[], remainingMessages:[...stopMessages]})
  const results = {
    range: {
      "fromUtc": range.startDate,
      "toUtc": range.endDate
    },
    events: eventsWithEngineStop.newEvents.reverse(),
    unmatchedEngineRunStartMessages: eventsWithEngineStart.remainingMessages,
    unmatchedEngineRunEndMessages: eventsWithEngineStop.remainingMessages
  }

  return results;
}

module.exports.get = getEvents