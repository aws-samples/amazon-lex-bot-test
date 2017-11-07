/*
	Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in
	compliance with the License. A copy of the License is located at
		http://aws.amazon.com/apache2.0/
	or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
	specific language governing permissions and limitations under the License.


	testlexbot
	------------
	This script can be used to regression test an Amazon Lex bot.  It relies on the
	AWS SDK and the Amazon Lex Runtime Service API.

	The user must have IAM permissions to invoke the API functions (e.g., AmazonLexReadOnly)
	http://docs.aws.amazon.com/lex/latest/dg/access-control-managing-permissions.html#access-policy-examples-aws-managed

	To install:
	$ npm init
	$ npm install aws-sdk  # if you don't have it installed globally
	# copy this file as testlexbot.js

	To use:
	$ node testlexbot.js <testconfig>
	# e.g., node testlexbot.js test/CoffeeBot-main.json
*/

// TODO:  allow initialization for sessionAttributes
// TODO:  allow initialization for request attributes
// TODO:  capture request attributes like the request id
// TODO:  add a test for required sessionAttributes
// TODO:  add a test for required request attributes
// TODO:  add a test for required responseCardOptions (and/or title/subtitle)

'use strict';

const AWS = require('aws-sdk');
const FS = require('fs');

const MAX_CONCURRENT_SEQUENCES = 10;
AWS.config.region = 'us-east-1'; // Region
let lexruntime = new AWS.LexRuntime();

function recordFailure(botName, botAlias, sequence, params, lexResponse, requestId, message) {

	const errorBlob = {
		message: message,
		requestId: requestId,
		sequence:  sequence,
		params: params,
		lexResponse: lexResponse
	};

	console.error(`-  Sequence [${sequence.name}] FAILED! ~ ${JSON.stringify(errorBlob)}`);
}

function recordSuccess(botName, botAlias, sequence, message) {

	const successBlob = {
		message: message,
		sequence:  sequence
	};

	console.log(`+  Sequence [${sequence.name}] PASSED! ~ ${JSON.stringify(successBlob)}`);
}

function checkSlotValues(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId) {

	let postConditions = interaction.postConditions;

	if (postConditions.slots && (postConditions.slots.length > 0) &&
		postConditions.intentName && (postConditions.intentName !== '')) {

		// compare the slot values with expected values
		if (lexResponse.intentName == postConditions.intentName) {

			// compare each slot value with what was expected
			let succeeded = true;
			postConditions.slots.forEach(function(slot) {

				if ( (! (slot.slotValue == null) && (lexResponse.slots[slot.slotName] == null)) &&
					((lexResponse.slots[slot.slotName] == null) || (! lexResponse.slots[slot.slotName].match(slot.slotValue)))) {

					// record a failure
					recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
						`Slot value ${slot.slotName} did not match (actual) [${lexResponse.slots[slot.slotName]}] !~= (expected) [${slot.slotValue}] for [${interaction.utterance}]`);
					succeeded = false;
				} else {

					console.log(`I  [${sequence.name}/${interaction.utterance}] Acceptable slot value found - ${slot.slotName} / ${lexResponse.slots[slot.slotName]}`);
				}
			});
			return succeeded;

		} else {
			// record a failure
			if (lexResponse.intentName) {
				recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
					`Intent name did not match (actual) [${lexResponse.intentName}] != (expected) [${postConditions.intentName}] for [${interaction.utterance}]`);
			} else {
				recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
					`Missed utterance (expected) [${postConditions.intentName}] for [${interaction.utterance}]`);
			}
			return false;
		}

	} else {
		// record a failure
		recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
			`Either slot values or Intent name were not provided, so did not match [${JSON.stringify(postConditions.slots)}]`);
		return false;
	}
}

function checkDialogState(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId) {

	let postConditions = interaction.postConditions;

	if (postConditions.dialogState && (postConditions.dialogState !== '')) {

		// compare the dialogState with what is expected
		if (lexResponse.dialogState == postConditions.dialogState) {

			// check IntentName if one has been provided
			if (postConditions.intentName && (postConditions.intentName !== '')) {

				if (postConditions.intentName != lexResponse.intentName) {

					// record a failure
					recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
						`Intent name did not match (actual) [${lexResponse.intentName}] != (expected) [${postConditions.intentName}] for [${interaction.utterance}]`);
					return false;

				} else {

					console.log(`I  [${sequence.name}/${interaction.utterance}] Acceptable dialogState found - ${lexResponse.dialogState} / ${lexResponse.intentName}`);
					return true;
				}

			} else
				return true;

		} else {
			// record a failure
			if (lexResponse.intentName) {
				recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
					`Dialog state did not match (actual) [${lexResponse.dialogState}] != (expected) [${postConditions.dialogState}]`);
			} else {
				recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
					`Missed utterance (expected) [${postConditions.intentName}] for [${interaction.utterance}]`);
			}
			return false;
		}

	} else {
		// record a failure
		recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
			`Dialog state was not provided, so did not match [${lexResponse.dialogState}]`);
		return false;
	}
}

function checkResponseMessage(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId) {

	let succeeded = true;

	// check for our postConditions
	let postConditions = interaction.postConditions;

	// check if the response is in the list of acceptableResponses
	let k = 0;
	let acceptableResponse = false;
	while ((! acceptableResponse) && (k < postConditions.message.length)) {

		if (lexResponse.message.match(postConditions.message[k])) {

			console.log(`I  [${sequence.name}/${interaction.utterance}] Acceptable response found - ${lexResponse.message}`);
			acceptableResponse = true;
		} else {
			// console.error(`      [${postConditions.message[k]}] !~= [${lexResponse.message}]`);
		}
		k++;
	}
	if (! acceptableResponse) {

		succeeded = false;
		recordFailure(botName, botAlias, sequence, lexParams, lexResponse, requestId,
			`No acceptable response found for message [${lexResponse.message}]`);
	}

	return succeeded;
}

function checkPostConditions(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId) {

	// check for our postConditions
	let postConditions = interaction.postConditions;

	// check if the response is in the list of acceptableResponses
	if (postConditions.message && postConditions.message.length > 0) {

		return checkResponseMessage(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId);

	} else if (postConditions.dialogState && (postConditions.dialogState !== '')) {
		return checkDialogState(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId);

	} else if (postConditions.slots && (postConditions.slots.length > 0)) {
		return checkSlotValues(botName, botAlias, sequence, interaction, lexParams, lexResponse, requestId);

	} else {
		return false;
	}
}

function performInteraction(userId, botName, botAlias, waitBetweenRequestsMillis, sequence, interactionIndex) {

	let interaction = sequence.sequence[interactionIndex];
	let interactionCount = sequence.sequence.length;
	let params = {
		botAlias: botAlias,
		botName: botName,
		userId: userId,
		sessionAttributes: {},
		inputText: interaction.utterance
	}

	// console.log(`    Interaction ${interactionIndex + 1} / ${interactionCount} - ${(interaction.utterance)}`);
	lexruntime.postText(params, function(err, data) {

		if (err) {
			recordFailure(botName, botAlias, interaction, params, null, null, `postText call failed with ${err}`);
			console.error(err, err.stack);
			// TODO:  use a callback so we limit concurrent API calls
			// we don't need to keep going
			sequenceTokensAvailable++;

		} else {

			if (checkPostConditions(botName, botAlias, sequence, interaction, params, data, this.requestId)) {

				// this one succeeded, so perform the next interaction in the sequence
				if ((interactionIndex + 1) < interactionCount) {

					delayIfRequested(waitBetweenRequestsMillis, function() {

						performInteraction(
							userId, botName, botAlias, waitBetweenRequestsMillis, sequence, (interactionIndex + 1));
					});

				} else {

					// the sequence was successful!
					recordSuccess(botName, botAlias, sequence, 'PASSED!');
					sequenceTokensAvailable++;
				}
			} else {

				// TODO:  use a callback so we limit concurrent API calls
				sequenceTokensAvailable++;
			}
		}
	});
}

function delayIfRequested(waitBetweenRequestsMillis, f) {

	if (waitBetweenRequestsMillis > 0) {

		// wait between interactions (to avoid a limit error?)
		// 'LimitExceededException: You are sending requests at an excessive rate\n  (429)
		setTimeout(f, waitBetweenRequestsMillis);
	} else {
		f.call();
	}
}

function waitOnSequenceTokens(waitBetweenChecksMillis, f) {

	let intervalHandle = setInterval(function() {

		if (sequenceTokensAvailable > 1) {

			clearInterval(intervalHandle);
			sequenceTokensAvailable--;
			f.call();
		}

	}, waitBetweenChecksMillis);
}

function runSequence(testConfig, sequenceIndex) {

	const sequenceCount = testConfig.sequences.length;
	const botName = testConfig.botName;
	const botAlias = testConfig.botAlias;
	const waitBetweenRequestsMillis = (testConfig.waitBetweenRequestsMillis ? testConfig.waitBetweenRequestsMillis : 0);
	let sequence = testConfig.sequences[sequenceIndex];
	let userId = (botName + '-' + (sequence.name ? sequence.name : '_') + '-' + ((new Date()).getTime()));

	console.log(`I Test sequence ${(sequenceIndex + 1)} / ${sequenceCount} - ${sequence.name}`);
	delayIfRequested(waitBetweenRequestsMillis, function() {

		performInteraction(userId, botName, botAlias, waitBetweenRequestsMillis, sequence, 0);
	});

	if ((sequenceIndex + 1) < sequenceCount) {

		waitOnSequenceTokens(100, function() {

			runSequence(testConfig, (sequenceIndex + 1));
		});
	}
}

if (process.argv.length != 3) {

	console.log(`Usage:  ${__filename} <testconfig>`);
	console.log(`    for example:  ${__filename}  test/CoffeeBot-main.json`)
	process.exit(-1);
}

const testConfigFile = process.argv[2];
let testConfig = JSON.parse(FS.readFileSync(testConfigFile));

console.log(`I Running test cases from ${testConfigFile} for ${testConfig.botName}:${testConfig.botAlias} - ${(testConfig.name ? testConfig.name : '')}`);
let sequenceTokensAvailable = MAX_CONCURRENT_SEQUENCES;
runSequence(testConfig, 0);
