# jmcl

A simple minecraft launcher, allows you to launch Minecraft with one simple command!

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

## TODO
* Game download;
* Forge/Fabric/third-party client support.