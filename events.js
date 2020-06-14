
const dateRange = require('./daterange')
const {verifyDateString,verifiedDateStringOrNull} = require('./verifyStrings')
const capitalize = string =>  typeof string === 'string' && string.length>0 ? string.charAt(0).toUpperCase() + string.slice(1) : string
const verifyStartMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate < eventDate && (oppositeEventDate === null || messageDate > oppositeEventDate) && messageDate > dateWithSubtractedSeconds(eventDate,30*60)
const verifyEndMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate > eventDate && (oppositeEventDate === null || messageDate < oppositeEventDate) && messageDate < dateWithAddedSeconds(eventDate,30*60)

const dateWithAddedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() + seconds )
    return newDate;
}
const dateWithSubtractedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() - seconds )
    return newDate;
}

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


const getEvents = async (timedata,sqldata,id,timeZone="UTC",start=null,end=null) => {
  start = verifiedDateStringOrNull(start)
  end = verifiedDateStringOrNull(end)

  if( (!start && end) || (start && !end) ){
    throw new Error(`Only received ${start ? `start '${start}'` : `end '${end}'`}. If 'start' or 'end' query parameter is given both must be given.`)
  }
  if( start && end && !(verifyDateString(start) && verifyDateString(end))){
    throw new Error({error: `start '${start}' or end '${end}' invalid format.`})
  }
  
  if(end && end.length < 11){
    const endDate = new Date(end)
    endDate.setDate(endDate.getDate() + 1)
    end = endDate.toISOString()
  }

  const startDate = start ? new Date(start).toISOString() : null
  const endDate = end ? new Date(end).toISOString() : null
  const range = dateRange(startDate,endDate)
  const timeEvents = await timedata.get.events(id,"m",timeZone,range)
  

  let event = {}
  let events = []

  for( key in timeEvents ){
    const tSum = timeEvents[key].sum || 0
    if(tSum>0 && typeof event.start==='undefined'){
        event.start = tSum > 30 ? timeEvents[key].time : dateWithAddedSeconds(timeEvents[key].time,30)
    }else if(tSum<60 && typeof event.start !== 'undefined'){
        event.end = tSum < 30 ? dateWithSubtractedSeconds(timeEvents[key].time,60) : dateWithSubtractedSeconds(timeEvents[key].time,30)
        events.push(event)
        event = {}
    }
  }

  if( sqldata ){
    const startMessages =  await sqldata.get.message(id,sqldata.messages.start,range) 
    const stopMessages = await sqldata.get.message(id,sqldata.messages.stop,range)
    const eventsWithEngineStart = events.reduce(startMessageReducer, {newEvents:[],remainingMessages:[...startMessages]})
    const eventsWithEngineStop = eventsWithEngineStart.newEvents.reverse().reduce(stopMessageReducer, {newEvents:[], remainingMessages:[...stopMessages]})
    const results = {
      range: {
        "start": range.startDate,
        "end": range.endDate
      },
      events: eventsWithEngineStop.newEvents.reverse(),
      unmatchedEngineRunStartMessages: eventsWithEngineStart.remainingMessages,
      unmatchedEngineRunEndMessages: eventsWithEngineStop.remainingMessages
    }
    return results;
  }

  
  const results = {
    range: {
      "start": range.startDate,
      "end": range.endDate
    },
    events: events
  }

  return results;
}

module.exports.get = getEvents