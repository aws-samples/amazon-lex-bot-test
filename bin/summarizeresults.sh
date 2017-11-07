#!/bin/bash
#
#	Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
#	Copyright [first edit year]-[latest edit year] Amazon.com, Inc. or its affiliates. 
#	All Rights Reserved.
#	Licensed under the Amazon Software License (the "License"). You may not use this 
#	file except in compliance with the License. A copy of the License is located at
#       http://aws.amazon.com/asl/
#	or in the "license" file accompanying this file. This file is distributed on an 
#	"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. 
#	See the License for the specific language governing permissions and limitations 
#
# script to summarize test results

# we want pipe failures to cascade
set -o pipefail

function bailOnError {

	result=$?
	if [[ $result -ne 0 ]]
	then
		echo "ERROR:  $1 ($result)"
		exit $result
	fi
}

# dependencies
BC=`which bc`
bailOnError "We need bc to continue"
GREP=`which grep`
bailOnError "We need grep to continue"
CUT=`which cut`
bailOnError="We need cut to continue"
WC=`which wc`
bailOnError "We need wc to continue"
JQ=`which jq`
bailOnError "We need jq to continue"
HEAD=`which head`
bailOnError "We need head to continue"
AWK=`which awk`
bailOnError "We need awk to continue"

resultsFile="$1"
if [[ -z "${resultsFile}" ]]
then
	echo "ERROR:  Please specify a file name to analyze"
	exit 1
fi

if [[ ! -r "${resultsFile}" ]]
then
	echo "ERROR:  Could not find file to summarize (${resultsFile})"
	exit 1
fi

echo "Summary from ${resultsFile}..."

totalTests=`$GREP '^[-+]' ${resultsFile} | $WC -l`
successfulTests=`$GREP '^+' ${resultsFile} | $WC -l`
failedTests=`$GREP '^-' ${resultsFile} | $WC -l`
missedUtterances=`$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Missed utterance' ${resultsFile} | $WC -l`
misclassifiedIntents=`$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Intent name did not match' ${resultsFile} | $WC -l`
#TODO:  missedSlots=
incorrectSlotValues=`$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Slot value .* did not match' ${resultsFile} | $WC -l`

echo "${totalTests} Total tests"
# bc truncates
echo "${successfulTests} Successful (`echo "scale=3; (${successfulTests} * 100)  / ${totalTests}" | $BC -l`%)"
echo "${failedTests} Failed (`echo "scale=3; (${failedTests} * 100)  / ${totalTests}" | $BC -l`%)"

echo "${missedUtterances} Missed utterances (`echo "scale=3; (${missedUtterances} * 100)  / ${totalTests}" | $BC -l`%)"
echo "${misclassifiedIntents} Misclassified intents (`echo "scale=3; (${misclassifiedIntents} * 100)  / ${totalTests}" | $BC -l`%)"

echo "${incorrectSlotValues} Incorrect slot values (`echo "scale=3; (${incorrectSlotValues} * 100)  / ${totalTests}" | $BC -l`%)"

# calculations
tp=`$GREP '^+' ${resultsFile} | $CUT -d '~' -f 2- | $JQ 'select(.sequence.sequence[0].postConditions.intentName != null) | .sequence.name' - | $WC -l`
tn=`$GREP '^+' ${resultsFile} | $CUT -d '~' -f 2- | $JQ 'select(.sequence.sequence[0].postConditions.intentName == null) | .sequence.name' - | $WC -l`
fp=`$GREP '^-' ${resultsFile} | $CUT -d '~' -f 2- | $JQ 'select(.sequence.sequence[0].postConditions.intentName == null) | .sequence.name' - | $WC -l`
fn=`$GREP '^-.*Missed utterance' ${resultsFile} | $WC -l`
mm=`$GREP '^-' ${resultsFile} | $CUT -d '~' -f 2- | $GREP 'Intent name did not match' | $JQ 'select(.sequence.sequence[0].postConditions.intentName != null) | .sequence.name' - | $WC -l`
ac=0; pr=0; re=0; fm=0
if [[ $tp -gt 0 ]]
then
	ac=0`echo "scale=6; ($tp + $tn) / ($tp + $tn + $fp + $fn + $mm)" | $BC -l`
	pr=0`echo "scale=6; ($tp) / ($tp + $fp + $mm)" | $BC -l`
	re=0`echo "scale=6; ($tp) / ($tp + $fn + $mm)" | $BC -l`
	fm=0`echo "scale=6; (2 * $pr * $re) / ($pr + $re)" | $BC -l`
fi

echo ""
echo "Intent Classification Metrics"
echo "${tp} True positives (correctly classified an utterance that was not 'out of domain')"
echo "${tn} True negatives (correctly classified an utterance that was 'out of domain')"
echo "${fp} False positives (incorrectly classified an utterance that was 'out of domain' as some intent)"
echo "${fn} False negatives (incorrectly classified an utterance (as 'out of domain') that was not 'out of domain')"
echo "${mm} Mismatches (incorrectly classified an utterance as some other (not 'out of domain') intent than it was"
echo "${ac} Accuracy - (tp + tn) / (tp + fp + tn + fn + mm)"
echo "${pr} Precision - tp / (tp + fp + mm)"
echo "${re} Recall - tp / (tp + fn + mm)"
echo "${fm} F-measure - (2 * precision * recall) / (precision + recall)"

echo ""
echo "Examples of missed utterances"
if [[ $missedUtterances -gt 2000 ]]
then
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Missed utterance' ${resultsFile} | $CUT -d '~' -f 2 | $JQ -r '"  " + .message' | \
	$AWK 'BEGIN {srand()} !/^$/ { if (rand() <= .01) print $0}' | \
	$HEAD -n 40
else
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Missed utterance' ${resultsFile} | $CUT -d '~' -f 2 | $JQ -r '"  " + .message' | $HEAD -n 20
fi

echo ""
echo "Examples of misclassified intents"
if [[ $misclassifiedIntents -gt 2000 ]]
then
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Intent name did not match' ${resultsFile} | $CUT -d '~' -f 2 | $JQ -r '"  " + .message' | \
	$AWK 'BEGIN {srand()} !/^$/ { if (rand() <= .01) print $0}' | \
	$HEAD -n 40
else
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Intent name did not match' ${resultsFile} | $CUT -d '~' -f 2 | $JQ -r '"  " + .message' | $HEAD -n 20
fi

echo ""
echo "Examples of incorrect slot values"
if [[ $incorrectSlotValues -gt 2000 ]]
then
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Slot value .* did not match' ${resultsFile} | \
		$CUT -d '~' -f 2-3 | $JQ -r '"  " + .message' | \
		$AWK 'BEGIN {srand()} !/^$/ { if (rand() <= .01) print $0}' | \
		$HEAD -n 40
else
	$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Slot value .* did not match' ${resultsFile} | $CUT -d '~' -f 2-3 | $JQ -r '"  " + .message' | $HEAD -n 20
fi

echo ""
echo "Examples of incorrect dialog states (which may be missed slots)"
$GREP '^-  Sequence \[.*\] FAILED! ~ {"message":"Dialog state did not match (actual)' ${resultsFile} | $CUT -d '~' -f 2-3 | $JQ -r '"  " + .message + " for [" + .sequence.sequence[].utterance + "] response [" +  .lexResponse.message + "]"' | $HEAD -n 20

if [[ $fp -gt 0 ]]
then
	echo ""
	echo "Examples of false positives"
	$GREP '^-' ${resultsFile} | $CUT -d '~' -f 2- | $JQ -r 'select(.sequence.sequence[0].postConditions.intentName == null) | .message + " for [" + .sequence.sequence[].utterance + "]"' - | $HEAD -n 20
fi
