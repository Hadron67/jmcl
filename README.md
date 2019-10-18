# jmcl

A simple minecraft launcher and version manager running on node. Allows you to launch or download Minecraft with one simple command!

## Command line usage

### Launch
```sh
jmcl launch -u <uname> -v <version of minecraft to be launched> 
```
It will prompt you to enter password if this is first run, where `<uname>` is the email address of your Mojang(Yggrasil) account.

Add `--offline` option to launch in offline mode, in which case `<uname>` should be in-game user name. ~~Should I remove this option to support Mojang?~~

### Logout
```sh
jmcl logout -u <your email>
```

### Game installing and deleting
Install Minecraft version specified by `<version>`:
```sh
jmcl install <version>
```
It will do library and assets file checking if already installed, that is, download missing files and re-download files with bad check sums. To do this check for all installed versions, run
```sh
jmcl install-all
```

To delete a verion:
```sh
jmcl remove <version>
```
This would only remove the main jar package and version file. If you want to delete unnecessay libraries and asset files, you may want to use
```sh
jmcl cleanup
```
which will delete all game files that aren't used by any installed versions.

## TODO
* Forge/Fabric/third-party client support.