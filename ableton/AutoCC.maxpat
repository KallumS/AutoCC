{
 "patcher": {
  "fileversion": 1,
  "appversion": {
   "major": 9,
   "minor": 0,
   "revision": 0,
   "architecture": "x64",
   "modernui": 1
  },
  "classnamespace": "box",
  "rect": [
   100.0,
   100.0,
   960.0,
   560.0
  ],
  "openinpresentation": 1,
  "default_fontsize": 10.0,
  "default_fontface": 0,
  "default_fontname": "Arial",
  "gridonopen": 1,
  "gridsize": [
   8.0,
   8.0
  ],
  "gridsnaponopen": 1,
  "objectsnaponopen": 1,
  "statusbarvisible": 2,
  "toolbarvisible": 1,
  "boxes": [
   {
    "box": {
     "id": "obj-1",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      20.0,
      50.0,
      22.0
     ],
     "outlettype": [
      "int"
     ],
     "text": "midiin"
    }
   },
   {
    "box": {
     "id": "obj-2",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      120.0,
      20.0,
      90.0,
      22.0
     ],
     "outlettype": [
      "bang",
      "int",
      "int"
     ],
     "text": "live.thisdevice"
    }
   },
   {
    "box": {
     "id": "obj-3",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 3,
     "patching_rect": [
      20.0,
      200.0,
      140.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "p window",
     "patcher": {
      "fileversion": 1,
      "appversion": {
       "major": 9,
       "minor": 0,
       "revision": 0,
       "architecture": "x64",
       "modernui": 1
      },
      "classnamespace": "box",
      "rect": [
       80.0,
       80.0,
       820.0,
       730.0
      ],
      "openinpresentation": 1,
      "toolbarvisible": 0,
      "statusbarvisible": 0,
      "enablehscroll": 0,
      "enablevscroll": 0,
      "title": "AutoCC",
      "boxes": [
       {
        "box": {
         "id": "obj-1",
         "maxclass": "inlet",
         "numinlets": 0,
         "numoutlets": 1,
         "patching_rect": [
          20.0,
          20.0,
          30.0,
          30.0
         ],
         "outlettype": [
          ""
         ],
         "text": "inlet",
         "comment": "window"
        }
       },
       {
        "box": {
         "id": "obj-2",
         "maxclass": "inlet",
         "numinlets": 0,
         "numoutlets": 1,
         "patching_rect": [
          120.0,
          20.0,
          30.0,
          30.0
         ],
         "outlettype": [
          ""
         ],
         "text": "inlet",
         "comment": "MIDI, bang, restore, actions"
        }
       },
       {
        "box": {
         "id": "obj-3",
         "maxclass": "v8ui",
         "numinlets": 1,
         "numoutlets": 3,
         "patching_rect": [
          120.0,
          80.0,
          820.0,
          730.0
         ],
         "outlettype": [
          "",
          "",
          ""
         ],
         "filename": "AutoCC.js",
         "parameter_enable": 0,
         "border": 0,
         "presentation": 1,
         "presentation_rect": [
          0.0,
          0.0,
          820.0,
          730.0
         ]
        }
       },
       {
        "box": {
         "id": "obj-4",
         "maxclass": "outlet",
         "numinlets": 1,
         "numoutlets": 0,
         "patching_rect": [
          120.0,
          850.0,
          30.0,
          30.0
         ],
         "text": "outlet"
        }
       },
       {
        "box": {
         "id": "obj-5",
         "maxclass": "outlet",
         "numinlets": 1,
         "numoutlets": 0,
         "patching_rect": [
          240.0,
          850.0,
          30.0,
          30.0
         ],
         "text": "outlet"
        }
       },
       {
        "box": {
         "id": "obj-6",
         "maxclass": "outlet",
         "numinlets": 1,
         "numoutlets": 0,
         "patching_rect": [
          360.0,
          850.0,
          30.0,
          30.0
         ],
         "text": "outlet"
        }
       },
       {
        "box": {
         "id": "obj-7",
         "maxclass": "newobj",
         "numinlets": 0,
         "numoutlets": 4,
         "patching_rect": [
          320.0,
          20.0,
          40.0,
          22.0
         ],
         "outlettype": [
          "int",
          "int",
          "int",
          "int"
         ],
         "text": "key"
        }
       },
       {
        "box": {
         "id": "obj-8",
         "maxclass": "newobj",
         "numinlets": 1,
         "numoutlets": 1,
         "patching_rect": [
          320.0,
          50.0,
          75.0,
          22.0
         ],
         "outlettype": [
          ""
         ],
         "text": "prepend key"
        }
       }
      ],
      "lines": [
       {
        "patchline": {
         "source": [
          "obj-7",
          0
         ],
         "destination": [
          "obj-8",
          0
         ]
        }
       },
       {
        "patchline": {
         "source": [
          "obj-8",
          0
         ],
         "destination": [
          "obj-3",
          0
         ]
        }
       },
       {
        "patchline": {
         "source": [
          "obj-2",
          0
         ],
         "destination": [
          "obj-3",
          0
         ]
        }
       },
       {
        "patchline": {
         "source": [
          "obj-3",
          0
         ],
         "destination": [
          "obj-4",
          0
         ]
        }
       },
       {
        "patchline": {
         "source": [
          "obj-3",
          1
         ],
         "destination": [
          "obj-5",
          0
         ]
        }
       },
       {
        "patchline": {
         "source": [
          "obj-3",
          2
         ],
         "destination": [
          "obj-6",
          0
         ]
        }
       }
      ]
     }
    }
   },
   {
    "box": {
     "id": "obj-4",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      420.0,
      55.0,
      22.0
     ],
     "text": "midiout"
    }
   },
   {
    "box": {
     "id": "obj-5",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      200.0,
      420.0,
      80.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "pattr state",
     "parameter_enable": 1,
     "varname": "state",
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_longname": "state",
       "parameter_shortname": "state",
       "parameter_type": 3,
       "parameter_invisible": 1,
       "parameter_initial_enable": 0
      }
     }
    }
   },
   {
    "box": {
     "id": "obj-6",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      200.0,
      460.0,
      95.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend restore"
    }
   },
   {
    "box": {
     "id": "obj-7",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      420.0,
      420.0,
      244.0,
      40.0
     ],
     "text": "Show Window opens AutoCC's own window.",
     "presentation": 1,
     "presentation_rect": [
      8.0,
      8.0,
      244.0,
      40.0
     ],
     "linecount": 2,
     "textcolor": [
      0.867,
      0.882,
      0.906,
      1.0
     ],
     "fontsize": 11.0
    }
   },
   {
    "box": {
     "id": "obj-8",
     "maxclass": "live.text",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      420.0,
      20.0,
      120.0,
      20.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "Show Window",
     "texton": "Show Window",
     "mode": 0,
     "parameter_enable": 0,
     "presentation": 1,
     "presentation_rect": [
      8.0,
      56.0,
      118.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "obj-9",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      420.0,
      60.0,
      80.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "route bang 1"
    }
   },
   {
    "box": {
     "id": "obj-10",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      100.0,
      30.0,
      22.0
     ],
     "outlettype": [
      "bang"
     ],
     "text": "t b"
    }
   },
   {
    "box": {
     "id": "obj-11",
     "maxclass": "message",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      140.0,
      40.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "open"
    }
   },
   {
    "box": {
     "id": "obj-12",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      180.0,
      60.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "pcontrol"
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "obj-1",
      0
     ],
     "destination": [
      "obj-3",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-2",
      0
     ],
     "destination": [
      "obj-3",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-3",
      0
     ],
     "destination": [
      "obj-4",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-3",
      1
     ],
     "destination": [
      "obj-5",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-5",
      0
     ],
     "destination": [
      "obj-6",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-6",
      0
     ],
     "destination": [
      "obj-3",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-3",
      2
     ],
     "destination": [
      "obj-7",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-8",
      0
     ],
     "destination": [
      "obj-9",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-9",
      0
     ],
     "destination": [
      "obj-10",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-9",
      1
     ],
     "destination": [
      "obj-10",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-10",
      0
     ],
     "destination": [
      "obj-11",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-11",
      0
     ],
     "destination": [
      "obj-12",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-12",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   }
  ],
  "parameters": {
   "obj-5": [
    "state",
    "state",
    0
   ],
   "inherited_shortname": 1
  },
  "dependency_cache": [
   {
    "name": "AutoCC.js",
    "bootpath": ".",
    "type": "TEXT",
    "implicit": 1
   }
  ],
  "autosave": 0,
  "devicewidth": 260.0,
  "description": "",
  "digest": "",
  "tags": "",
  "style": "",
  "latency": 0,
  "is_mpe": 0
 }
}
