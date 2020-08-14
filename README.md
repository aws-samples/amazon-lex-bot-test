# amazon-lex-bot-test

This is an example script to demonstrate how one can regression test an Amazon Lex bot. It relies on the AWS SDK and the [Amazon Lex Runtime Service API](http://docs.aws.amazon.com/lex/latest/dg/API_Operations_Amazon_Lex_Runtime_Service.html).

The user must have [IAM permissions](http://docs.aws.amazon.com/lex/latest/dg/access-control-managing-permissions.html#access-policy-examples-aws-managed) to invoke the API functions (e.g., `AmazonLexReadOnly`).

## To install

```bash
# git clone ...
# npm install
```

## To use

```bash
$ node testlexbot.js <TestConfigFile>
# examples:
# node testlexbot.js test/CoffeeBot-main.json
# node testlexbot.js test/CoffeeBot-main.json 2>&1 > results.txt
# node testlexbot.js test/CoffeeBot-main.json 2>&1 > results.txt && ./bin/summarizeResults.sh results.txt
```

## Updates

### August 14, 2020

Changed logic to compare post condition when a Lex response has multiple messages by adding post conditions to an array and comparing against response by index.

Example of the business case: [{ "Hi there" }, { "Here's more information" }, { "And more" }}

## License

This sample code is made available under the MIT-0 license. See the LICENSE file.
