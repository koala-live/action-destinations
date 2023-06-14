import nock from 'nock'
import Twilio from '..'
import { createTestIntegration } from '@segment/actions-core'
import { createLoggerMock, getPhoneMessageInputDataGenerator } from '../utils/test-utils'

const twilio = createTestIntegration(Twilio)
const timestamp = new Date().toISOString()
const defaultTemplateSid = 'my_template'
const defaultTo = 'whatsapp:+1234567891'
const logger = createLoggerMock()

const getDefaultMapping = (overrides?: any) => {
  return {
    userId: { '@path': '$.userId' },
    from: 'MG1111222233334444',
    contentSid: defaultTemplateSid,
    send: true,
    traitEnrichment: true,
    externalIds: [
      { type: 'email', id: 'test@twilio.com', subscriptionStatus: 'subscribed' },
      { type: 'phone', id: '+1234567891', subscriptionStatus: 'subscribed', channelType: 'whatsapp' }
    ],
    ...overrides
  }
}

describe.each(['stage', 'production'])('%s environment', (environment) => {
  const spaceId = 'd'
  const getInputData = getPhoneMessageInputDataGenerator({
    environment,
    timestamp,
    spaceId,
    logger,
    getDefaultMapping
  })

  afterEach(() => {
    twilio.responses = []
    nock.cleanAll()
    jest.clearAllMocks()
  })

  describe('send WhatsApp', () => {
    it('should abort when there is no `phone` external ID in the payload', async () => {
      const responses = await twilio.testAction(
        'sendWhatsApp',
        getInputData({
          mappingOverrides: {
            externalIds: [{ type: 'email', id: 'test@twilio.com', subscriptionStatus: 'subscribed' }]
          }
        })
      )

      expect(responses.length).toEqual(0)
    })

    it('should abort when there is no `channelType` in the external ID payload', async () => {
      const responses = await twilio.testAction(
        'sendWhatsApp',
        getInputData({
          mappingOverrides: {
            externalIds: [{ type: 'phone', id: '+1234567891', subscriptionStatus: 'subscribed' }]
          }
        })
      )

      expect(responses.length).toEqual(0)
    })

    it('should send WhatsApp', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData()

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('should send WhatsApp for custom hostname', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo
      })

      const twilioHostname = 'api.nottwilio.com'

      const twilioRequest = nock(`https://${twilioHostname}/2010-04-01/Accounts/a`)
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({ settingsOverrides: { twilioHostname } })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        `https://${twilioHostname}/2010-04-01/Accounts/a/Messages.json`
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('should send WhatsApp with custom metadata', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo,
        StatusCallback:
          'http://localhost/?foo=bar&space_id=d&__segment_internal_external_id_key__=phone&__segment_internal_external_id_value__=%2B1234567891#rp=all&rc=5'
      })
      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: { customArgs: { foo: 'bar' } },
        settingsOverrides: {
          webhookUrl: 'http://localhost',
          connectionOverrides: 'rp=all&rc=5'
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)

      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('should fail on invalid webhook url', async () => {
      const actionInputData = getInputData({
        mappingOverrides: { customArgs: { foo: 'bar' } },
        settingsOverrides: { webhookUrl: 'foo' }
      })

      await expect(twilio.testAction('sendWhatsApp', actionInputData)).rejects.toHaveProperty(
        'code',
        'PAYLOAD_VALIDATION_FAILED'
      )
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`TE Messaging: WHATSAPP invalid webhook url`),
        expect.any(String)
      )
    })
  })
  describe('subscription handling', () => {
    it.each(['subscribed', true])('sends an WhatsApp when subscriptonStatus ="%s"', async (subscriptionStatus) => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          externalIds: [{ type: 'phone', id: '+1234567891', subscriptionStatus, channelType: 'whatsapp' }]
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it.each(['unsubscribed', 'did not subscribed', false, null])(
      'does NOT send an WhatsApp when subscriptonStatus ="%s"',
      async (subscriptionStatus) => {
        const expectedTwilioRequest = new URLSearchParams({
          ContentSid: defaultTemplateSid,
          From: 'MG1111222233334444',
          To: defaultTo
        })

        const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
          .post('/Messages.json', expectedTwilioRequest.toString())
          .reply(201, {})

        const actionInputData = getInputData({
          mappingOverrides: {
            externalIds: [{ type: 'phone', id: '+1234567891', subscriptionStatus, channelType: 'whatsapp' }]
          }
        })

        const responses = await twilio.testAction('sendWhatsApp', actionInputData)
        expect(responses).toHaveLength(0)
        expect(twilioRequest.isDone()).toEqual(false)
      }
    )

    it('Unrecognized subscriptionStatus treated as Unsubscribed"', async () => {
      const randomSubscriptionStatusPhrase = 'some-subscription-enum'

      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo
      })

      nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          externalIds: [
            {
              type: 'phone',
              id: '+1234567891',
              subscriptionStatus: randomSubscriptionStatusPhrase,
              channelType: 'whatsapp'
            }
          ]
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses).toHaveLength(0)
      expect(actionInputData.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('TE Messaging: WHATSAPP Invalid subscription statuses found in externalIds'),
        expect.anything()
      )
      expect(actionInputData.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('TE Messaging: WHATSAPP Not sending message, because sendabilityStatus'),
        expect.anything()
      )
    })

    it('formats the to number correctly for whatsapp', async () => {
      const from = 'whatsapp:+19876543210'
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: from,
        To: 'whatsapp:+19195551234'
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          from: from,
          contentSid: defaultTemplateSid,
          externalIds: [{ type: 'phone', id: '(919) 555 1234', subscriptionStatus: true, channelType: 'whatsapp' }]
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('throws an error when whatsapp number cannot be formatted', async () => {
      const actionInputData = getInputData({
        mappingOverrides: {
          externalIds: [{ type: 'phone', id: 'abcd', subscriptionStatus: true, channelType: 'whatsapp' }]
        }
      })

      const response = twilio.testAction('sendWhatsApp', actionInputData)
      await expect(response).rejects.toThrowError(
        'The string supplied did not seem to be a phone number. Phone number must be able to be formatted to e164 for whatsapp.'
      )
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^TE Messaging: WHATSAPP invalid phone number - ${spaceId}`)),
        expect.anything()
      )
    })

    it('throws an error when liquid template parsing fails', async () => {
      const actionInputData = getInputData({
        mappingOverrides: {
          contentVariables: { '1': '{{profile.traits.firstName$}}', '2': '{{profile.traits.address.street}}' },
          traits: {
            firstName: 'Soap',
            address: {
              street: '360 Scope St'
            }
          }
        }
      })

      const response = twilio.testAction('sendWhatsApp', actionInputData)
      await expect(response).rejects.toThrowError('Unable to parse templating in content variables')
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^TE Messaging: WHATSAPP Failed to parse template with content variables - ${spaceId}`)
        ),
        expect.anything()
      )
    })

    it('throws an error when Twilio API request fails', async () => {
      const expectedErrorResponse = {
        code: 21211,
        message: "The 'To' number is not a valid phone number.",
        more_info: 'https://www.twilio.com/docs/errors/21211',
        status: 400
      }

      nock('https://api.twilio.com/2010-04-01/Accounts/a').post('/Messages.json').reply(400, expectedErrorResponse)

      const actionInputData = getInputData()

      const response = twilio.testAction('sendWhatsApp', actionInputData)
      await expect(response).rejects.toThrowError()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^TE Messaging: WHATSAPP Twilio Programmable API error - ${spaceId}`)),
        expect.anything()
      )
    })

    it('formats and sends content variables', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo,
        ContentVariables: JSON.stringify({ '1': 'Soap', '2': '360 Scope St' })
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          contentVariables: { '1': '{{profile.traits.firstName}}', '2': '{{profile.traits.address.street}}' },
          traits: {
            firstName: 'Soap',
            address: {
              street: '360 Scope St'
            }
          }
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('omits null/empty content variables', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo,
        ContentVariables: JSON.stringify({ '2': '360 Scope St' })
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          contentVariables: { '1': '{{profile.traits.firstName}}', '2': '{{profile.traits.address.street}}' },
          traits: {
            firstName: null,
            address: {
              street: '360 Scope St'
            }
          }
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })

    it('sends content variables as is when traits are not enriched', async () => {
      const expectedTwilioRequest = new URLSearchParams({
        ContentSid: defaultTemplateSid,
        From: 'MG1111222233334444',
        To: defaultTo,
        ContentVariables: JSON.stringify({ '1': 'Soap', '2': '360 Scope St' })
      })

      const twilioRequest = nock('https://api.twilio.com/2010-04-01/Accounts/a')
        .post('/Messages.json', expectedTwilioRequest.toString())
        .reply(201, {})

      const actionInputData = getInputData({
        mappingOverrides: {
          contentVariables: { '1': 'Soap', '2': '360 Scope St' },
          traitEnrichment: false
        }
      })

      const responses = await twilio.testAction('sendWhatsApp', actionInputData)
      expect(responses.map((response) => response.url)).toStrictEqual([
        'https://api.twilio.com/2010-04-01/Accounts/a/Messages.json'
      ])
      expect(twilioRequest.isDone()).toEqual(true)
    })
  })
})