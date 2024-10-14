# Cribl Pack for Edge UTF-16 Support
----

## About this Pack

This Pack enables the Cribl Edge File Monitor source to support files in UTF-16LE encoding.  A custom event breaker is required, and a code function is used to map UTF-16LE to UTF-8.  Once properly encoded, the autotimestamp function is used to successfully read the timestamp from the event.

As of this writing (Edge 4.x), File Monitor parses all files as UTF-8.  This pack will be deprecated once Cribl Edge directly supports UTF-16.  

Single-line events and Multi-line events are both supported.  

UTF-16LE sources tested with this pack include:
* Microsoft SQL server Error logs

__Note__:  Although Cribl Edge does not natively support UTF-16, your browser certainly does.  This results in a situation where the Cribl UI may display events properly, even though they are not parsed correctly.  Proper testing of event breaking, and of the pipeline included in this pack against your data sample(s), requires additional steps.   Specific details on how to do this are included below.

## Deployment

Deployment of this pack requires creation of a custom event breaker, tying this pack *specifically* to those File Monitor sources that need UTF-16 support.
 
All events must begin with a date stamp beginning YYYY-MM-DD.  Only files whose characters map directly to a corresponding UTF-8 character have been tested to work.  Test this pack against a saved sample file from your own environment prior to putting the pack into production!   

### 1. Install the Pack
Install the pack as normal.

### 2. Configure the Event Breaker

For the UTF-16 file to be parsed correctly, a custom Event Breaker is needed. Repeat the steps below for each Edge Fleet that will need to parse UTF-16LE encoded files.

1. Select the Edge Fleet
2. Select More -> Knowledge and click Event Breaker Rules
3. Click "Add Ruleset"

__ID:__ UTF-16LE_Multiline

__Description:__ Use this event breaker only for sources that are known to be UTF-16LE Multiline events that start with a timestamp.

__Min raw length:__ 50

Click "Add Rule"

__Name:__ utf16_starting_with_year

__Filter condition:__ true

__Event Breaker type:__ Rexex

__Event Breaker:__ ^(?=\u00002\u00000\u0000[23]\u0000\d\u0000-)

__ FLAGS: Enable the multi line flag for the Regex __

__Timestamp Anchor:__ ^

__Timestamp Format:__ Current time 

_Timestamps must be parsed in the pipeline, as they won't be successfully parsed at the time of the event breaking._


### 2. Create a File Monitor Source

Dedicated File Monitor sources should be used when collecting from UTF-16 encoded files.  (Do not use this pack with UTF-8 or ASCII files.)

1. From Edge, select an Edge Fleet where the UTF-16LE event breaker has already been configured.
2. Go to Collect, Add Source, then File Monitor
3. General Settings: Set "Force text format" to "Yes".   Set other settins as desired.
4. Event Breakers: Click Add Ruleset, and select UTF-16_Multiline
5. Pre-Processing: Set this to the Edge_UTF-16_support pack.  Using Pre-Processing ensures that any output from this pack may then be sent to another pack or pipeline for additional processing.
6. Save the source.
7. During testing, it is recommended you connect this source to the DevNull output.

_It is strongly suggested that you complete testing prior to additional File Monitor sources for UTF-16 encoded files._

### 3. Testing the Event Breaker

As noted in "About this Pack", there are differences in UTF encoding support in your browser vs. support in the Edge File Monitor itself.  You will not be able to use your browser to visually verify the proper fuctioning of the event breaker, either by upload of a sample file or by copy/paste.

Instead, you will first need to test the function of the event breaker directly by configuring the File monitor as detailed above. 

The following approach is suggested, as one way to test even breaking:
1. Configure the File Monitor as detailed above, set it to read any files within a given test directory.
2. Save, Commit, and Deploy the configuration.  (The Edge node itself is a required part of the test.)
3. From the File Monitor source, use the Live Data option to capture events before the pre-processing line.  Set the capture time to 1000.
4. Using a file editor on the Edge node, open an existing UTF-16LE encoded file.
5. Edit the timestamp on the first event in the file to be the now-current time, and use Save As to save this file with a new name.

Within 10 seconds, the File Monitor on the Edge node should detect the new file, and you will have a sample file ready for use.

If properly working, you will see one event captured for each event read.  _You may see unexpected characters and incorrect timestamp parsing, this is normal._

Once the file has been parsed, stop the capture.  Save this sample file for additional testing.

### 4. Testing the Pipeline

You are now ready to test the pipeline itself, against sample file(s) already collected.  Because of the difference in UTF-16 support between your web browser and the Cribl File Monitor source, testing requires additional steps.

1. Select the Edge Fleet where sample file has been captured.
2. From More, selec Packs, then the Edge_UTF-16_support pack.
3. From Pipelines, select UTF-16
4. In the Sample Data panel, select the sample file.  You may need to de-select "In Pack only".
5. On the "IN" tab, note how the sample file looks.  Then go to the gear icon and select Render Whitespace.  You are now viewing the input stream as Cribl Edge would see it.  (Lots of nulls, odd characters, etc.)
6. Timestamps on the "IN" tab probably refer to the local time when you displayed the sample file, rather than the timestamps from the event.
7. Switch to "OUT".  Verify timestamps, verify that the extra characters have also been stripped.

### 5. Going live.

Once testing is complete, modify your File Monitor source to connect to the one or more destinations you would like to leverage.

## Upgrades

Upgrading certian Cribl Packs using the same Pack ID can have unintended consequences. See [Upgrading an Existing Pack](https://docs.cribl.io/stream/packs#upgrading) for details.

To upgrade this pack, Cribl recommends that you install future versions with a unique Pack ID by appending the version number to the Pack ID during import. This allows side-by-side comparisons as you test the updated version.  When ready, put the new pack version into production by modifying any File Monitor sources using UTF-16 encoding, such that they use the updated pack.

Once all File Monitors using the old pack have been removed, one may remove the outdated version of the pack.

## Release Notes

### Version 0.7.0 - 2024-10-26

The initial release of the Cribl Pack for Edge UTF-16 Support.

## Contributing to the Pack

To contribute to the Pack, please connect with Michael Donnelly on [Cribl Community Slack](https://cribl-community.slack.com/). You can suggest new features or offer to collaborate.

## License
---
This Pack uses the following license: [`Apache 2.0`](https://github.com/criblio/appscope/blob/master/LICENSE).
