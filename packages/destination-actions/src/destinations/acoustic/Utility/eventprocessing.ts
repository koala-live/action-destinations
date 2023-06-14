import { IntegrationError } from '@segment/actions-core'
import get from 'lodash/get'
import { Payload } from '../receiveEvents/generated-types'

export function parseSections(section: { [key: string]: string }, nestDepth: number) {
  const parseResults: { [key: string]: string } = {}
  try {
    //if (nestDepth > 5) return parseResults
    if (nestDepth > 10)
      throw new IntegrationError(
        'Event data exceeds nesting depth. Use Mapping to avoid nesting data attributes more than 3 levels deep',
        'NESTING_DEPTH_EXCEEDED',
        400
      )

    for (const key of Object.keys(section)) {
      if (typeof section[key] === 'object') {
        nestDepth++
        const nested: { [key: string]: string } = parseSections(
          section[key] as {} as { [key: string]: string },
          nestDepth
        )
        for (const nestedKey of Object.keys(nested)) {
          parseResults[`${key}.${nestedKey}`] = nested[nestedKey]
        }
      } else {
        parseResults[key] = section[key]
      }
    }
  } catch (e) {
    throw new IntegrationError(
      `Unexpected Exception while parsing Event payload.\n ${e}`,
      'UNEXPECTED_EVENT_PARSING_EXCEPTION',
      400
    )
  }
  return parseResults
}

export function addUpdateEvents(payload: Payload, email: string, limit: number) {
  let eventName = ''
  let eventValue = ''
  let xmlRows = ''

  //Event Source
  const eventSource = get(payload, 'type', 'Null') + ' Event'

  //Timestamp
  // "timestamp": "2023-02-07T02:19:23.469Z"`
  const timestamp = get(payload, 'timestamp', 'Null')

  let propertiesTraitsKV: { [key: string]: string } = {}
  try {
    if (payload.key_value_pairs)
      propertiesTraitsKV = {
        ...propertiesTraitsKV,
        ...parseSections(payload.key_value_pairs as { [key: string]: string }, 0)
      }

    if (payload.array_data)
      propertiesTraitsKV = {
        ...propertiesTraitsKV,
        ...parseSections(payload.array_data as unknown as { [key: string]: string }, 0)
      }

    if (payload.traits)
      propertiesTraitsKV = {
        ...propertiesTraitsKV,
        ...parseSections(payload.traits as { [key: string]: string }, 0)
      }
    if (payload.properties)
      propertiesTraitsKV = {
        ...propertiesTraitsKV,
        ...parseSections(payload.properties as { [key: string]: string }, 0)
      }
    if (payload.context)
      propertiesTraitsKV = {
        ...propertiesTraitsKV,
        ...parseSections(payload.context as { [key: string]: string }, 0)
      }

    if (Object.keys(propertiesTraitsKV).length > limit) {
      throw new IntegrationError(
        'Properties Exceed Max. Use Mapping to limit the number of Attributes (Properties, Traits) present and thereby reduce the Campaign Relational Table Rows consumed.',
        'EXCEEDS_MAX_PROPERTIES_MAX',
        400
      )
    }
  } catch (e) {
    throw new IntegrationError(
      'Unexpected Exception processing payload \n ${e}',
      'UNEXPECTED_EXCEPTION_PROCESSING_PAYLOAD',
      400
    )
  }

  //   Identify events generated by an audience have the audience key set to true or false based on whether the user is entering or exiting the audience:
  // {
  //   "type": "identify",
  //   "userId": u123,
  //   "traits": {
  //      "first_time_shopper": true // false when a user exits the audience
  //   }
  // }
  // Track events generated by an audience have a key for the audience name, and a key for the audience value:
  // {
  //   "type": "track",
  //   "userId": u123,
  //   "event": "Audience Entered", // "Audience Exited" when a user exits an audience
  //   "properties": {
  //      "audience_key": "first_time_shopper",
  //      "first_time_shopper": true // false when a user exits the audience
  //   }
  // }

  let ak = ''
  let av = ''
  //Audience
  const getValue = (o: object, part: string) => Object.entries(o).find(([k, _v]) => k.includes(part))?.[1]

  if (getValue(propertiesTraitsKV, 'computation_class')) {
    ak = getValue(propertiesTraitsKV, 'computation_key')
    av = getValue(propertiesTraitsKV, `${ak}`)
  }

  if (getValue(propertiesTraitsKV, 'audience_key')) {
    ak = getValue(propertiesTraitsKV, 'audience_key')
    av = getValue(propertiesTraitsKV, `${ak}`)
  }

  if (av !== '') {
    let audiStatus = av

    eventValue = audiStatus
    audiStatus = audiStatus.toString().toLowerCase()
    if (audiStatus === 'true') eventValue = 'Audience Entered'
    if (audiStatus === 'false') eventValue = 'Audience Exited'
    eventName = ak

    xmlRows += `  
      <ROW>
      <COLUMN name="EMAIL">           <![CDATA[${email}]]></COLUMN>
      <COLUMN name="EventSource">     <![CDATA[${eventSource}]]></COLUMN>  
      <COLUMN name="EventName">       <![CDATA[${eventName}]]></COLUMN>
      <COLUMN name="EventValue">      <![CDATA[${eventValue}]]></COLUMN>
      <COLUMN name="Event Timestamp"> <![CDATA[${timestamp}]]></COLUMN>
      </ROW>`
  }

  //Wrap Properties and Traits into XML
  for (const e in propertiesTraitsKV) {
    const eventName = e
    const eventValue = propertiesTraitsKV[e]

    xmlRows += `
     <ROW>
     <COLUMN name="Email">           <![CDATA[${email}]]></COLUMN>
     <COLUMN name="EventSource">     <![CDATA[${eventSource}]]></COLUMN>  
     <COLUMN name="EventName">       <![CDATA[${eventName}]]></COLUMN>
     <COLUMN name="EventValue">      <![CDATA[${eventValue}]]></COLUMN>
     <COLUMN name="Event Timestamp"> <![CDATA[${timestamp}]]></COLUMN>
     </ROW>`
  }
  return xmlRows
}