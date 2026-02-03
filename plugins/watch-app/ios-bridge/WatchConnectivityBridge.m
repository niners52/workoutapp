#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WatchConnectivityBridge, RCTEventEmitter)
RCT_EXTERN_METHOD(sendWorkoutState:(NSDictionary *)state)
RCT_EXTERN_METHOD(sendRestTimerUpdate:(NSDictionary *)data)
RCT_EXTERN_METHOD(sendWorkoutEnded)
RCT_EXTERN_METHOD(isWatchPaired:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isWatchReachable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
