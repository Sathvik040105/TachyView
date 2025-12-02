from nddavPackage import *

import sys
import os
import argparse

############# preprocessing data ############
# layout = {
#     "column": [
#         {"row": ["HDFile", "Summary P.C."]},
#         ##{"column": ["Topological Spine", "Summary P.C.", "Parallel Coordinate"]} #'Scatter Plot']}
#         {"row": ["Topological Spine","Summary Scatter"]}  # 'Scatter Plot']} "Summary P.C.", "Parallel Coordinate"
#
#     ]
# }

############### small data test #################
# defalutLayout = {
#     "column": [
#         {"row": ["Filtering", "Neighborhood", "Topological Spine"]},
#         {"row": ["Parallel Coordinate", "Scatter Plot"]}
#     ]
# }
defalutLayout = {
    "column": [
        {"row": ["Topological Spine", "Volume Rendering"]},
        {"row": ["Topological Landscape"]}
    ]
}

def initializeBackendModules():
    """
    Initialize backend modules that don't have UI components but are needed by other modules.
    Called after the UI layout is initialized.
    """
    print("########## Initializing hidden backend modules ##########")
    # Create NeighborhoodModule without UI - required by EGModule
    # Note: filterComponent and DataModule are instantiated from JavaScript in appIndex.html
    from hdanalysis.modules import NeighborhoodModule, EGModule
    import nddavPackage
    registry = nddavPackage.registry
    
    registry.context.addModule(NeighborhoodModule)
    registry.context.addModule(EGModule)
    print("########## Backend modules initialized ##########")

def main(arguments):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('--port', default=5000, help="Specified the port for the localhost.", type=int)
    parser.add_argument('--layout', default=None, help="Specify layout", type=str)

    args = parser.parse_args(arguments)
    if args.layout:
        with open(args.layout, "r") as read_file:
            layout = json.load(read_file)
    else:
        layout = defalutLayout

    vis = nddav(layout, port=args.port)
    
    # Set callback to initialize backend modules after UI is ready
    vis.setAfterInitilizationCallback(initializeBackendModules)
    
    vis.show()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
