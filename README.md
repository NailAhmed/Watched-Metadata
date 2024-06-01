# MetadataWatcher Plugin for Obsidian

MetadataWatcher is a plugin for Obsidian that monitors changes in metadata fields of your notes and performs specific actions based on these changes. It allows you to configure header replacements and command executions triggered by metadata updates.

## Features

- **Header Replacement**: Automatically replace specific headers in your notes with metadata values when they change.
- **Command Execution**: Execute predefined commands when metadata fields are updated.

## Installation

1. Download the latest release of the plugin.
2. Extract the files to your Obsidian plugins directory: `<vault>/.obsidian/plugins/metadata-watcher`.
3. Enable the plugin in the Obsidian settings.

## Configuration

The plugin can be configured through the settings tab in Obsidian. There are two main configuration sections: Header Groups and Command Groups.

### Header Groups

Header Groups allow you to replace headers in your notes based on metadata values. 

#### Adding a Header Group

1. Go to the plugin settings.
2. Switch to the **Header Groups** tab.
3. Click on **Add Header Group**.
4. Configure the field name to watch, the header text, and set it to active.

#### Example

If you want to replace a header with the value of `exampleField`, configure the group as follows:

- **Field Name**: `exampleField`
- **Header**: `## Example Header`
- **Active**: true

### Command Groups

Command Groups allow you to execute commands when metadata fields change.

#### Adding a Command Group

1. Go to the plugin settings.
2. Switch to the **Command Groups** tab.
3. Click on **Add Command Group**.
4. Configure the field name to watch, select the command to execute, and set it to active.

#### Example

If you want to execute a command when `exampleField` changes, configure the group as follows:

- **Field Name**: `exampleField`
- **Command**: Select the desired command from the list.
- **Active**: true

## Usage

Once configured, the plugin will monitor changes to the specified metadata fields in your notes. When changes are detected, it will either replace headers or execute commands based on your settings.

## Development

To build and modify this plugin, you'll need to have Node.js installed. Follow these steps:

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Make your changes to the code.
4. Run `npm run build` to build the plugin.
5. Copy the built files to your Obsidian plugins directory.

## Issues and Contributions

If you encounter any issues or have suggestions for improvements, please open an issue on the GitHub repository. Contributions are welcome!

## License

This plugin is licensed under the MIT License.

---

This README provides an overview of the MetadataWatcher plugin, how to install it, configure it, and how to contribute to its development. For more detailed information, refer to the source code and inline documentation within the plugin.
